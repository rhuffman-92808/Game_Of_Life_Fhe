pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";


contract GameOfLifeFhe is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error InvalidBatch();
    error ReplayDetected();
    error StateMismatch();
    error InvalidProof();
    error InvalidCoordinates();
    error InvalidCellState();
    error BatchNotClosed();

    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address account);
    event Unpaused(address account);
    event CooldownChanged(uint256 oldCooldown, uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event CellSubmitted(uint256 indexed batchId, address indexed provider, uint256 x, uint256 y, bytes32 encryptedCellState);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId, bytes32 stateHash);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 liveCells);

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    struct Cell {
        euint32 x;
        euint32 y;
        euint32 state; // 0 for dead, 1 for alive
    }

    uint256 public constant WIDTH = 10;
    uint256 public constant HEIGHT = 10;

    mapping(uint256 => mapping(uint256 => Cell)) public board;
    mapping(address => bool) public isProvider;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    address public owner;
    bool public paused;
    uint256 public cooldownSeconds;
    uint256 public currentBatchId;
    bool public batchOpen;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier respectCooldown(address user, mapping(address => uint256) storage accessTime) {
        if (block.timestamp < accessTime[user] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        cooldownSeconds = 60; // Default cooldown: 1 minute
        currentBatchId = 0;
        batchOpen = false;
        // FHE library key is set by SepoliaConfig constructor
    }

    function addProvider(address provider) external onlyOwner {
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        isProvider[provider] = false;
        emit ProviderRemoved(provider);
    }

    function setPause(bool _paused) external onlyOwner {
        paused = _paused;
        if (_paused) {
            emit Paused(msg.sender);
        } else {
            emit Unpaused(msg.sender);
        }
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        emit CooldownChanged(cooldownSeconds, newCooldownSeconds);
        cooldownSeconds = newCooldownSeconds;
    }

    function openBatch() external onlyOwner whenNotPaused {
        if (batchOpen) {
            currentBatchId++;
        }
        batchOpen = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyOwner whenNotPaused {
        if (!batchOpen) revert InvalidBatch();
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitCell(
        uint256 x,
        uint256 y,
        bytes32 encryptedCellState
    ) external onlyProvider whenNotPaused respectCooldown(msg.sender, lastSubmissionTime) {
        if (x >= WIDTH || y >= HEIGHT) revert InvalidCoordinates();
        if (!batchOpen) revert InvalidBatch();

        Cell storage cell = board[currentBatchId][x + y * WIDTH]; // Linearize coordinates
        cell.x = FHE.asEuint32(x);
        cell.y = FHE.asEuint32(y);
        cell.state = FHE.asEuint32(encryptedCellState);

        lastSubmissionTime[msg.sender] = block.timestamp;
        emit CellSubmitted(currentBatchId, msg.sender, x, y, encryptedCellState);
    }

    function requestBatchDecryption(uint256 batchId) external whenNotPaused respectCooldown(msg.sender, lastDecryptionRequestTime) {
        if (batchOpen) revert BatchNotClosed(); // Cannot decrypt an open batch
        if (batchId != currentBatchId) revert InvalidBatch(); // Only decrypt the latest closed batch

        bytes32[] memory cts = new bytes32[](WIDTH * HEIGHT);
        uint256 index = 0;
        for (uint256 i = 0; i < WIDTH * HEIGHT; ) {
            Cell storage cell = board[batchId][i];
            cts[index++] = FHE.toBytes32(cell.state);
            unchecked { i++; }
        }

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });

        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        DecryptionContext storage ctx = decryptionContexts[requestId];

        // Replay guard
        if (ctx.processed) revert ReplayDetected();

        // State verification
        bytes32[] memory cts = new bytes32[](WIDTH * HEIGHT);
        uint256 index = 0;
        for (uint256 i = 0; i < WIDTH * HEIGHT; ) {
            Cell storage cell = board[ctx.batchId][i];
            cts[index++] = FHE.toBytes32(cell.state);
            unchecked { i++; }
        }
        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != ctx.stateHash) revert StateMismatch();

        // Proof verification
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) revert InvalidProof();

        // Decode & Finalize
        uint256 liveCells = 0;
        for (uint256 i = 0; i < WIDTH * HEIGHT; ) {
            uint32 state = abi.decode(cleartexts, (uint32));
            // Consume the decoded value from the head of cleartexts
            cleartexts = cleartexts[32:];
            if (state == 1) {
                liveCells++;
            }
            unchecked { i++; }
        }

        ctx.processed = true;
        emit DecryptionCompleted(requestId, ctx.batchId, liveCells);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 v) internal {
        if (!FHE.isInitialized(v)) {
            v = FHE.asEuint32(0);
        }
    }

    function _requireInitialized(euint32 v) internal pure {
        if (!FHE.isInitialized(v)) {
            revert("FHE: euint32 not initialized");
        }
    }
}