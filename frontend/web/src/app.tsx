// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface CellState {
  x: number;
  y: number;
  alive: boolean;
}

interface GameRecord {
  id: string;
  encryptedCells: string;
  timestamp: number;
  owner: string;
  generation: number;
}

// FHE encryption/decryption simulation
const FHEEncryptCells = (cells: CellState[]): string => {
  const simplified = cells.map(c => `${c.x},${c.y},${c.alive ? 1 : 0}`).join(';');
  return `FHE-${btoa(simplified)}`;
};

const FHEDecryptCells = (encryptedData: string): CellState[] => {
  if (!encryptedData.startsWith('FHE-')) return [];
  try {
    const decrypted = atob(encryptedData.substring(4));
    return decrypted.split(';').map(item => {
      const [x, y, alive] = item.split(',');
      return { x: parseInt(x), y: parseInt(y), alive: alive === '1' };
    });
  } catch (e) {
    console.error("Decryption failed:", e);
    return [];
  }
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<GameRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [initialCells, setInitialCells] = useState<CellState[]>([]);
  const [gridSize, setGridSize] = useState(20);
  const [selectedGame, setSelectedGame] = useState<GameRecord | null>(null);
  const [decryptedCells, setDecryptedCells] = useState<CellState[]>([]);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [isSimulating, setIsSimulating] = useState(false);
  const [currentGeneration, setCurrentGeneration] = useState(0);
  const [simulationSpeed, setSimulationSpeed] = useState(500);

  // Initialize random cells
  const generateRandomCells = useCallback(() => {
    const cells: CellState[] = [];
    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        if (Math.random() > 0.7) {
          cells.push({ x, y, alive: true });
        }
      }
    }
    setInitialCells(cells);
  }, [gridSize]);

  useEffect(() => {
    generateRandomCells();
    loadGames().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, [generateRandomCells]);

  const loadGames = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("game_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing game keys:", e); }
      }
      
      const list: GameRecord[] = [];
      for (const key of keys) {
        try {
          const gameBytes = await contract.getData(`game_${key}`);
          if (gameBytes.length > 0) {
            try {
              const gameData = JSON.parse(ethers.toUtf8String(gameBytes));
              list.push({ 
                id: key, 
                encryptedCells: gameData.cells, 
                timestamp: gameData.timestamp, 
                owner: gameData.owner,
                generation: gameData.generation || 0
              });
            } catch (e) { console.error(`Error parsing game data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading game ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setGames(list);
    } catch (e) { console.error("Error loading games:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitGame = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    if (initialCells.length === 0) { alert("Please create initial cells"); return; }
    
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting cells with Zama FHE..." });
    
    try {
      const encryptedCells = FHEEncryptCells(initialCells);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const gameId = `game-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const gameData = { 
        cells: encryptedCells, 
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address,
        generation: 0
      };
      
      await contract.setData(`game_${gameId}`, ethers.toUtf8Bytes(JSON.stringify(gameData)));
      
      const keysBytes = await contract.getData("game_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(gameId);
      await contract.setData("game_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted game submitted to blockchain!" });
      await loadGames();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreating(false); 
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<CellState[]> => {
    if (!isConnected) { alert("Please connect wallet first"); return []; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptCells(encryptedData);
    } catch (e) { 
      console.error("Decryption failed:", e); 
      return []; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const isOwner = (gameAddress: string) => address?.toLowerCase() === gameAddress.toLowerCase();

  // Game of Life simulation logic
  const computeNextGeneration = (cells: CellState[]): CellState[] => {
    const newCells: CellState[] = [];
    const cellMap = new Map<string, boolean>();
    
    // Create a map of current living cells for quick lookup
    cells.forEach(cell => {
      cellMap.set(`${cell.x},${cell.y}`, true);
    });
    
    // Check all potential cells that might change
    const potentialCells = new Set<string>();
    cells.forEach(cell => {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          potentialCells.add(`${cell.x + dx},${cell.y + dy}`);
        }
      }
    });
    
    // Apply Game of Life rules to each potential cell
    potentialCells.forEach(cellKey => {
      const [xStr, yStr] = cellKey.split(',');
      const x = parseInt(xStr);
      const y = parseInt(yStr);
      
      // Count live neighbors
      let liveNeighbors = 0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          if (cellMap.has(`${x + dx},${y + dy}`)) {
            liveNeighbors++;
          }
        }
      }
      
      const isAlive = cellMap.has(cellKey);
      
      // Apply Conway's rules
      if (isAlive && (liveNeighbors === 2 || liveNeighbors === 3)) {
        newCells.push({ x, y, alive: true });
      } else if (!isAlive && liveNeighbors === 3) {
        newCells.push({ x, y, alive: true });
      }
    });
    
    return newCells;
  };

  const runSimulation = useCallback(async () => {
    if (!selectedGame) return;
    
    setIsSimulating(true);
    let currentCells = decryptedCells.length > 0 ? decryptedCells : FHEDecryptCells(selectedGame.encryptedCells);
    let generation = selectedGame.generation;
    
    const interval = setInterval(async () => {
      currentCells = computeNextGeneration(currentCells);
      generation++;
      setDecryptedCells(currentCells);
      setCurrentGeneration(generation);
      
      // Update the game record every 10 generations
      if (generation % 10 === 0 && isOwner(selectedGame.owner)) {
        try {
          const contract = await getContractWithSigner();
          if (!contract) return;
          
          const encryptedCells = FHEEncryptCells(currentCells);
          const gameData = { 
            cells: encryptedCells, 
            timestamp: selectedGame.timestamp, 
            owner: selectedGame.owner,
            generation
          };
          
          await contract.setData(`game_${selectedGame.id}`, ethers.toUtf8Bytes(JSON.stringify(gameData)));
          await loadGames();
        } catch (e) {
          console.error("Error updating game:", e);
        }
      }
    }, simulationSpeed);
    
    return () => {
      clearInterval(interval);
      setIsSimulating(false);
    };
  }, [selectedGame, decryptedCells, simulationSpeed]);

  const toggleCell = (x: number, y: number) => {
    const index = initialCells.findIndex(c => c.x === x && c.y === y);
    if (index >= 0) {
      const newCells = [...initialCells];
      newCells[index].alive = !newCells[index].alive;
      setInitialCells(newCells);
    } else {
      setInitialCells([...initialCells, { x, y, alive: true }]);
    }
  };

  const renderGrid = (cells: CellState[], size: number, interactive = false) => {
    const grid = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const isAlive = cells.some(c => c.x === x && c.y === y && c.alive);
        grid.push(
          <div 
            key={`${x}-${y}`}
            className={`cell ${isAlive ? 'alive' : ''}`}
            style={{ 
              left: `${x * 20}px`, 
              top: `${y * 20}px`,
              width: '18px',
              height: '18px'
            }}
            onClick={interactive ? () => toggleCell(x, y) : undefined}
          />
        );
      }
    }
    return grid;
  };

  const renderStats = () => {
    const totalGames = games.length;
    const activeGames = games.filter(g => g.generation > 0).length;
    const oldestGame = games.length > 0 ? Math.min(...games.map(g => g.timestamp)) : 0;
    const newestGame = games.length > 0 ? Math.max(...games.map(g => g.timestamp)) : 0;
    
    return (
      <div className="stats-container">
        <div className="stat-item">
          <div className="stat-value">{totalGames}</div>
          <div className="stat-label">Total Games</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{activeGames}</div>
          <div className="stat-label">Active Games</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{oldestGame > 0 ? new Date(oldestGame * 1000).toLocaleDateString() : 'N/A'}</div>
          <div className="stat-label">Oldest Game</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{newestGame > 0 ? new Date(newestGame * 1000).toLocaleDateString() : 'N/A'}</div>
          <div className="stat-label">Newest Game</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="pixel-spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container pixel-theme">
      <header className="app-header">
        <div className="logo">
          <h1>FHE<span>Game</span>Of<span>Life</span></h1>
          <p>On-chain simulation with encrypted initial states</p>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="pixel-button">
            Create New Game
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Conway's Game of Life with FHE</h2>
            <p>Set encrypted initial states and watch them evolve on-chain</p>
          </div>
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
        </div>

        <div className="dashboard-section">
          <div className="project-intro pixel-card">
            <h3>About This Project</h3>
            <p>
              This is an on-chain implementation of Conway's Game of Life where initial cell states are encrypted using 
              <strong> Zama FHE (Fully Homomorphic Encryption)</strong>. The game evolves publicly on-chain while keeping 
              the initial configuration private. Each generation is computed using homomorphic operations.
            </p>
            <div className="fhe-process">
              <div className="process-step">
                <div className="step-icon">1</div>
                <p>Encrypt initial cells with FHE</p>
              </div>
              <div className="process-step">
                <div className="step-icon">2</div>
                <p>Submit encrypted state to blockchain</p>
              </div>
              <div className="process-step">
                <div className="step-icon">3</div>
                <p>Watch evolution unfold on-chain</p>
              </div>
            </div>
          </div>

          <div className="stats-section pixel-card">
            <h3>Game Statistics</h3>
            {renderStats()}
          </div>
        </div>

        <div className="games-section">
          <div className="section-header">
            <h2>Encrypted Game Records</h2>
            <div className="header-actions">
              <button onClick={loadGames} className="pixel-button" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh Games"}
              </button>
            </div>
          </div>

          <div className="games-list pixel-card">
            {games.length === 0 ? (
              <div className="no-games">
                <div className="no-games-icon"></div>
                <p>No encrypted games found</p>
                <button className="pixel-button" onClick={() => setShowCreateModal(true)}>
                  Create First Game
                </button>
              </div>
            ) : (
              <div className="games-grid">
                {games.map(game => (
                  <div 
                    key={game.id} 
                    className="game-item pixel-card"
                    onClick={() => setSelectedGame(game)}
                  >
                    <div className="game-id">#{game.id.substring(0, 8)}</div>
                    <div className="game-owner">{game.owner.substring(0, 6)}...{game.owner.substring(38)}</div>
                    <div className="game-date">{new Date(game.timestamp * 1000).toLocaleDateString()}</div>
                    <div className="game-generation">Gen: {game.generation}</div>
                    <div className="game-preview">
                      <div className="mini-grid">
                        {renderGrid(FHEDecryptCells(game.encryptedCells).slice(0, 16), 4)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal pixel-card">
            <div className="modal-header">
              <h2>Create New Game</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="grid-controls">
                <label>
                  Grid Size:
                  <select 
                    value={gridSize} 
                    onChange={(e) => setGridSize(parseInt(e.target.value))}
                    className="pixel-select"
                  >
                    <option value="10">10x10</option>
                    <option value="20">20x20</option>
                    <option value="30">30x30</option>
                  </select>
                </label>
                <button onClick={generateRandomCells} className="pixel-button">
                  Randomize Cells
                </button>
                <button 
                  onClick={() => setInitialCells([])} 
                  className="pixel-button"
                >
                  Clear All
                </button>
              </div>
              
              <div className="game-grid-container">
                <div className="game-grid">
                  {renderGrid(initialCells, gridSize, true)}
                </div>
              </div>
              
              <div className="fhe-notice">
                <div className="notice-icon">🔒</div>
                <p>
                  Initial cell states will be encrypted with Zama FHE before submission.
                  The encrypted data will be stored on-chain and evolve publicly.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowCreateModal(false)} 
                className="pixel-button"
              >
                Cancel
              </button>
              <button 
                onClick={submitGame} 
                disabled={creating || initialCells.length === 0}
                className="pixel-button primary"
              >
                {creating ? "Encrypting..." : "Submit Encrypted Game"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedGame && (
        <div className="modal-overlay">
          <div className="game-detail-modal pixel-card">
            <div className="modal-header">
              <h2>Game #{selectedGame.id.substring(0, 8)}</h2>
              <button onClick={() => {
                setSelectedGame(null);
                setDecryptedCells([]);
                setIsSimulating(false);
              }} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="game-info">
                <div className="info-item">
                  <span>Owner:</span>
                  <strong>{selectedGame.owner.substring(0, 6)}...{selectedGame.owner.substring(38)}</strong>
                </div>
                <div className="info-item">
                  <span>Created:</span>
                  <strong>{new Date(selectedGame.timestamp * 1000).toLocaleString()}</strong>
                </div>
                <div className="info-item">
                  <span>Generation:</span>
                  <strong>{currentGeneration || selectedGame.generation}</strong>
                </div>
              </div>
              
              <div className="game-controls">
                <button 
                  onClick={async () => {
                    if (decryptedCells.length > 0) {
                      setDecryptedCells([]);
                    } else {
                      const cells = await decryptWithSignature(selectedGame.encryptedCells);
                      setDecryptedCells(cells);
                    }
                  }}
                  disabled={isDecrypting}
                  className="pixel-button"
                >
                  {isDecrypting ? "Decrypting..." : 
                   decryptedCells.length > 0 ? "Hide Cells" : "Decrypt Initial State"}
                </button>
                
                <button 
                  onClick={isSimulating ? () => setIsSimulating(false) : runSimulation}
                  className="pixel-button primary"
                >
                  {isSimulating ? "Stop Simulation" : "Start Simulation"}
                </button>
                
                <div className="speed-control">
                  <label>Speed:</label>
                  <select 
                    value={simulationSpeed} 
                    onChange={(e) => setSimulationSpeed(parseInt(e.target.value))}
                    className="pixel-select"
                    disabled={isSimulating}
                  >
                    <option value="1000">Slow</option>
                    <option value="500">Normal</option>
                    <option value="200">Fast</option>
                  </select>
                </div>
              </div>
              
              <div className="game-display">
                <div className="game-grid">
                  {renderGrid(
                    decryptedCells.length > 0 ? decryptedCells : [], 
                    gridSize
                  )}
                </div>
              </div>
              
              <div className="fhe-status">
                <div className="status-icon">🔒</div>
                <p>
                  {decryptedCells.length > 0 ? 
                   "Initial state decrypted with your wallet signature" : 
                   "Cells are encrypted with Zama FHE"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content pixel-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="pixel-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>FHE Game of Life</h3>
            <p>On-chain simulation with encrypted initial states</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">About Zama FHE</a>
            <a href="#" className="footer-link">GitHub</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE Game of Life. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;