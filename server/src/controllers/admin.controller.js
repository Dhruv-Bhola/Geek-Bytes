const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

/**
 * GET /api/v1/admin/users
 *
 * Returns all users and their active case assignments.
 */
exports.getUsers = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Administrator access required",
      });
    }

    const users = await prisma.user.findMany({
      orderBy: {
        createdAt: "desc",
      },

      select: {
        id: true,
        customUserId: true,
        fullName: true,
        role: true,
        isActive: true,
        phone: true,
        email: true,
        jurisdictionCell: true,
        createdAt: true,

        caseAssignments: {
          where: {
            status: "active",
          },

          select: {
            caseId: true,
            assignedRole: true,

            case: {
              select: {
                id: true,
                caseId: true,
                caseTitle: true,
              },
            },
          },
        },
      },
    });

    const mappedUsers = users.map((user) => ({
      id: user.id,

      customUserId:
        user.customUserId,

      name:
        user.fullName,

      role:
        user.role,

      department:
        user.jurisdictionCell || "—",

      active:
        user.isActive,

      phone:
        user.phone,

      email:
        user.email,

      createdAt:
        user.createdAt,

      /*
       * Keep both the database UUID and the human-readable
       * case number available.
       */
      assignedCases:
        user.caseAssignments.map(
          (assignment) => ({
            id:
              assignment.case?.id ??
              assignment.caseId,

            caseId:
              assignment.case?.caseId ??
              null,

            assignedRole:
              assignment.assignedRole,
          })
        ),

      /*
       * Convenient frontend-friendly list.
       */
      assignedCaseIds:
        user.caseAssignments
          .map(
            (assignment) =>
              assignment.case?.caseId ??
              assignment.caseId
          ),
    }));

    return res.json({
      success: true,
      data: mappedUsers,
    });
  } catch (error) {
    console.error(
      "[admin] getUsers error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load users",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/admin/users
 *
 * Creates a user and persists the selected case assignments.
 *
 * The frontend may send either:
 *
 *   - Case database UUID
 *   - Human-readable case ID such as CYB-1042
 *
 * The backend resolves either form to the real Case.id UUID.
 */
exports.createUser = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message:
          "Administrator access required",
      });
    }

    const {
      name,
      employeeId,
      email,
      department,
      role,
      assignedCaseIds = [],
      permissions = [],
    } = req.body;

    /*
     * =========================================================
     * BASIC VALIDATION
     * =========================================================
     */

    if (
      !name ||
      !employeeId ||
      !email ||
      !role
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Name, employee ID, email and role are required",
      });
    }

    const validRoles = [
      "admin",
      "police",
      "investigator",
      "forensic",
      "lawyer",
      "judge",
      "victim",
    ];

    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user role",
      });
    }

    /*
     * Basic email validation.
     */
    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    /*
     * =========================================================
     * DUPLICATE USER CHECKS
     * =========================================================
     */

    const existingUser =
      await prisma.user.findFirst({
        where: {
          customUserId:
            employeeId.trim(),
        },
      });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message:
          "A user with this employee ID already exists",
      });
    }

    const existingEmail =
      await prisma.user.findFirst({
        where: {
          email:
            email.trim(),
        },
      });

    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message:
          "A user with this email already exists",
      });
    }

    /*
     * =========================================================
     * TEMPORARY PASSWORD
     * =========================================================
     *
     * Prototype only.
     *
     * Example:
     * employeeId = 003
     * password   = 003@DMS#2026
     */
    const temporaryPassword =
      `${employeeId.trim()}@DMS#2026`;

    const passwordHash =
      await bcrypt.hash(
        temporaryPassword,
        12
      );

    /*
     * =========================================================
     * NORMALIZE REQUESTED CASE IDs
     * =========================================================
     */

    const requestedCaseIds =
      Array.isArray(assignedCaseIds)
        ? [
            ...new Set(
              assignedCaseIds
                .filter(Boolean)
                .map((value) =>
                  String(value).trim()
                )
                .filter(Boolean)
            ),
          ]
        : [];

    /*
     * =========================================================
     * TRANSACTION
     * =========================================================
     */

    const result =
      await prisma.$transaction(
        async (tx) => {
          /*
           * ---------------------------------------------------
           * CREATE USER
           * ---------------------------------------------------
           */

          const createdUser =
            await tx.user.create({
              data: {
                customUserId:
                  employeeId.trim(),

                fullName:
                  name.trim(),

                email:
                  email.trim(),

                role:

                  role,

                passwordHash:
                  passwordHash,

                isActive:
                  true,

                jurisdictionCell:
                  department?.trim() ||
                  null,
              },
            });

          /*
           * ---------------------------------------------------
           * RESOLVE CASES
           * ---------------------------------------------------
           *
           * IMPORTANT:
           *
           * The frontend may send:
           *
           *   "CYB-1042"
           *
           * while PostgreSQL uses:
           *
           *   "d28bb6db-..."
           *
           * Therefore we search using BOTH:
           *
           *   Case.id
           *   Case.caseId
           */

          const resolvedCases = [];

          for (
            const requestedCaseId of
              requestedCaseIds
          ) {
            const caseRecord =
              await tx.case.findFirst({
                where: {
                  OR: [
                    {
                      id:
                        requestedCaseId,
                    },
                    {
                      caseId:
                        requestedCaseId,
                    },
                  ],
                },

                select: {
                  id: true,
                  caseId: true,
                  caseTitle: true,
                },
              });

            /*
             * If the case cannot be resolved,
             * do NOT silently pretend it was assigned.
             */
            if (!caseRecord) {
              throw new Error(
                `Case not found: ${requestedCaseId}`
              );
            }

            resolvedCases.push(
              caseRecord
            );
          }

          /*
           * ---------------------------------------------------
           * CREATE CASE ASSIGNMENTS
           * ---------------------------------------------------
           */

          for (
            const caseRecord of
              resolvedCases
          ) {
            await tx.caseAssignment.create({
              data: {
                caseId:
                  caseRecord.id,

                userId:
                  createdUser.id,

                assignedRole:
                  role,

                assignedBy:
                  req.user.id,

                status:
                  "active",
              },
            });
          }

          /*
           * ---------------------------------------------------
           * READ BACK ACTUAL SAVED ASSIGNMENTS
           * ---------------------------------------------------
           *
           * This is important.
           *
           * We return what actually exists in the DB,
           * not what the frontend originally submitted.
           */

          const savedAssignments =
            await tx.caseAssignment.findMany({
              where: {
                userId:
                  createdUser.id,

                status:
                  "active",
              },

              select: {
                caseId: true,
                assignedRole: true,

                case: {
                  select: {
                    id: true,
                    caseId: true,
                    caseTitle: true,
                  },
                },
              },
            });

          return {
            user:
              createdUser,

            assignments:
              savedAssignments,
          };
        }
      );

    /*
     * =========================================================
     * FORMAT ACTUAL SAVED ASSIGNMENTS
     * =========================================================
     */

    const assignedCases =
      result.assignments.map(
        (assignment) => ({
          id:
            assignment.case?.id ??
            assignment.caseId,

          caseId:
            assignment.case?.caseId ??
            null,

          caseTitle:
            assignment.case?.caseTitle ??
            null,

          assignedRole:
            assignment.assignedRole,
        })
      );

    const assignedCaseIdsResponse =
      result.assignments.map(
        (assignment) =>
          assignment.case?.caseId ??
          assignment.caseId
      );

    /*
     * =========================================================
     * RESPONSE
     * =========================================================
     */

    return res.status(201).json({
      success: true,

      message:
        "User created successfully",

      data: {
        id:
          result.user.id,

        customUserId:
          result.user.customUserId,

        name:
          result.user.fullName,

        email:
          result.user.email,

        role:
          result.user.role,

        department:
          result.user.jurisdictionCell ||
          "—",

        active:
          result.user.isActive,

        /*
         * ACTUAL assignments persisted in DB.
         */
        assignedCases,

        assignedCaseIds:
          assignedCaseIdsResponse,

        permissions:
          Array.isArray(permissions)
            ? permissions
            : [],
      },

      /*
       * Prototype only.
       *
       * Do NOT expose temporary passwords
       * in production.
       */
      temporaryPassword:
        temporaryPassword,
    });
  } catch (error) {
    console.error(
      "[admin] createUser error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to create user",

      error:
        error.message,
    });
  }
};