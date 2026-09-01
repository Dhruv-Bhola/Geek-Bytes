// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title EvidenceAuditLedger
 * @notice Immutable, relayered audit ledger for evidence integrity.
 *
 * Records a chain of events (UPLOADED / VERIFIED / ACCESSED / TRANSFERRED)
 * keyed by evidence id, storing the canonical SHA-256 hash plus the acting
 * address and timestamp. Provides on-chain verification of a live hash
 * against the most recently recorded hash.
 *
 * Only authorized relayers (the Secure Evidence DMS backend) may append records,
 * preserving a tamper-evident, append-only audit trail.
 */
contract EvidenceAuditLedger {
    // ---- Types ----

    struct AuditRecord {
        string evidenceId;
        string sha256Hash;
        string action; // "UPLOADED", "VERIFIED", "ACCESSED", "TRANSFERRED"
        address actorAddress;
        uint256 timestamp;
    }

    // ---- Events ----

    event EventRecorded(
        string indexed evidenceId,
        string sha256Hash,
        string action,
        address indexed actorAddress,
        uint256 timestamp
    );

    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);

    // ---- State ----

    address public owner;

    // Relayers permitted to append audit records / anchor hashes.
    mapping(address => bool) public authorizedRelayers;

    // evidenceId => ordered audit history (immutable, append-only).
    mapping(string => AuditRecord[]) private _records;

    // evidenceId => count of recorded events (fast lookup + gas savings).
    mapping(string => uint256) private _eventCounts;

    // ---- Modifiers ----

    modifier onlyOwner() {
        require(msg.sender == owner, "EvidenceAuditLedger: only owner");
        _;
    }

    modifier onlyAuthorizedRelayer() {
        require(
            authorizedRelayers[msg.sender],
            "EvidenceAuditLedger: caller is not an authorized relayer"
        );
        _;
    }

    // ---- Constructor ----

    constructor() {
        owner = msg.sender;
        authorizedRelayers[msg.sender] = true;
    }

    // ---- OWNER / RELAYER ADMINISTRATION ----

    /**
     * @notice Authorize a backend relayer wallet to append audit records.
     */
    function addRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "EvidenceAuditLedger: zero address");
        require(!authorizedRelayers[_relayer], "EvidenceAuditLedger: already authorized");
        authorizedRelayers[_relayer] = true;
        emit RelayerAdded(_relayer);
    }

    /**
     * @notice Revoke relayer access.
     */
    function removeRelayer(address _relayer) external onlyOwner {
        require(authorizedRelayers[_relayer], "EvidenceAuditLedger: not authorized");
        authorizedRelayers[_relayer] = false;
        emit RelayerRemoved(_relayer);
    }

    // ---- CORE: AUDIT RECORDING ----

    /**
     * @notice Append an immutable audit event for an evidence id.
     * @param _evidenceId   Unique evidence identifier (e.g. "E-042")
     * @param _sha256Hash   64-char hexadecimal SHA-256 digest
     * @param _action       One of "UPLOADED", "VERIFIED", "ACCESSED", "TRANSFERRED"
     */
    function recordEvent(
        string calldata _evidenceId,
        string calldata _sha256Hash,
        string calldata _action
    ) external onlyAuthorizedRelayer {
        require(bytes(_evidenceId).length > 0, "EvidenceAuditLedger: empty evidenceId");
        require(_isValidSha256(_sha256Hash), "EvidenceAuditLedger: invalid SHA-256 hash");
        require(
            _isSupportedAction(_action),
            "EvidenceAuditLedger: unsupported action"
        );

        _records[_evidenceId].push(
            AuditRecord({
                evidenceId: _evidenceId,
                sha256Hash: _sha256Hash,
                action: _action,
                actorAddress: msg.sender,
                timestamp: block.timestamp
            })
        );
        _eventCounts[_evidenceId]++;

        emit EventRecorded(
            _evidenceId,
            _sha256Hash,
            _action,
            msg.sender,
            block.timestamp
        );
    }

    // ---- CORE: VERIFICATION ----

    /**
     * @notice Verify a live hash against the most recently recorded hash.
     * @return valid          true if the current hash matches the latest record
     * @return historyCount   total number of events recorded for the evidence
     */
    function verifyHash(
        string calldata _evidenceId,
        string calldata _currentHash
    ) external view returns (bool valid, uint256 historyCount) {
        AuditRecord[] storage records = _records[_evidenceId];
        historyCount = records.length;

        if (historyCount == 0) {
            return (false, 0);
        }

        AuditRecord storage latest = records[historyCount - 1];
        return (
            _equal(latest.sha256Hash, _currentHash),
            historyCount
        );
    }

    /**
     * @notice Return the full immutable audit history for an evidence id.
     */
    function getAuditHistory(string calldata _evidenceId)
        external
        view
        returns (AuditRecord[] memory)
    {
        return _records[_evidenceId];
    }

    /**
     * @notice Return a single audit record by index (0 = oldest).
     */
    function getRecord(
        string calldata _evidenceId,
        uint256 _index
    ) external view returns (AuditRecord memory) {
        require(_index < _records[_evidenceId].length, "EvidenceAuditLedger: index out of bounds");
        return _records[_evidenceId][_index];
    }

    /**
     * @notice Records count for an evidence id.
     */
    function eventCount(string calldata _evidenceId) external view returns (uint256) {
        return _eventCounts[_evidenceId];
    }

    // ---- INTERNAL HELPERS ----

    function _isValidSha256(string memory _hash) internal pure returns (bool) {
        bytes memory b = bytes(_hash);
        if (b.length != 64) return false;
        for (uint256 i = 0; i < 64; i++) {
            bytes1 c = b[i];
            bool isDigit = c >= "0" && c <= "9";
            bool isLower = c >= "a" && c <= "f";
            bool isUpper = c >= "A" && c <= "F";
            if (!(isDigit || isLower || isUpper)) return false;
        }
        return true;
    }

    function _isSupportedAction(string memory _action) internal pure returns (bool) {
        bytes32 actionHash = keccak256(bytes(_action));
        return
            actionHash == keccak256("UPLOADED") ||
            actionHash == keccak256("VERIFIED") ||
            actionHash == keccak256("ACCESSED") ||
            actionHash == keccak256("TRANSFERRED");
    }

    function _equal(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
