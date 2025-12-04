# Game of Life FHE: An On-Chain Simulation of Cellular Evolution

The **Game of Life FHE** is a revolutionary on-chain simulation powered by **Zama's Fully Homomorphic Encryption technology**. This project transforms Conway's classic cellular automaton into a dynamic and evolving environment, where players can set encrypted initial cell states and observe interactions within a vast, continuously evolving world on the blockchain. The fusion of gaming and encrypted computation allows for a unique exploration of complex systems and emergence phenomena.

## Understanding the Challenge

In today’s digital landscape, ensuring privacy while utilizing interactive simulations poses a significant challenge. Traditional simulations often lack the capability to secure initial conditions, exposing sensitive information to potential unauthorized access. Players wanting to engage with simulations that reflect real-life uncertainties need a platform that provides both engagement and confidentiality. This gap between the need for engaging interactive platforms and the lack of secure computation methods is what **Game of Life FHE** aims to address.

## The FHE Solution

Leveraging **Fully Homomorphic Encryption (FHE)**, our project enables players to set initial conditions in a completely encrypted form. As a result, users can engage with a simulation that evolves while keeping their input hidden from prying eyes. This ensures that the integrity of the players' inputs is maintained, providing a layer of security that traditional simulations cannot offer.

By utilizing Zama's open-source libraries, such as **Concrete**, **TFHE-rs**, and the **zama-fhe SDK**, we can perform computations on encrypted data, allowing the "Game of Life" to evolve without exposing the players' initial cellular states. This groundbreaking approach not only enhances user privacy but also allows for a rich tapestry of interactions within a digital ecosystem, making it a significant advancement in the field of confidential computing.

## Core Functionalities 🌱

### Key Features

- **FHE-Encrpted Initial States**: Players can set initial cell configurations securely using encryption.
- **Continuous Evolution**: The world evolves dynamically on-chain, showcasing real-time interactions between various encrypted configurations.
- **Social Experimentation**: Transform a mathematical game into a grand social experiment, exploring emergent properties in complex systems.
- **Scalable Canvas**: A modular and scalable universe for the Game of Life, allowing for varied player experiences and experimentation with cellular patterns.

## Technology Stack ⚙️

- **Zama SDK**: The primary component for confidential computing, enabling encryption and computation on encrypted data.
- **Node.js**: JavaScript runtime for building server-side applications.
- **Hardhat**: A development environment to compile, deploy, test, and debug Ethereum software.
- **Solidity**: The programming language for smart contracts on Ethereum.

## Project Structure 📁

Here’s a quick overview of our directory structure:

```
Game_Of_Life_Fhe/
│
├── contracts/
│   ├── Game_Of_Life_Fhe.sol
│
├── scripts/
│   ├── deploy.js
│
├── test/
│   ├── GameOfLife.test.js
│
├── package.json
├── hardhat.config.js
└── README.md
```

## Setting Up Your Environment 🔧

To get started with the **Game of Life FHE**, please ensure you have the following prerequisites installed:

1. **Node.js** - Make sure you have Node.js installed on your machine.
2. **Hardhat** - Install Hardhat globally using the command: `npm install --global hardhat`.

Follow these steps to set up the project:

1. Download the project files (do not use `git clone`).
2. Navigate to the project directory using your terminal.
3. Run the following command to install all necessary dependencies:
   ```bash
   npm install
   ```
   This will fetch and install Zama FHE libraries along with other required packages.

## Compile and Run the Project 🚀

After setting up the environment, you can compile and run your Game of Life simulation using the following commands:

1. **Compile the Smart Contracts**:
   ```bash
   npx hardhat compile
   ```

2. **Run Tests**:
   To ensure everything is working correctly, run the tests with:
   ```bash
   npx hardhat test
   ```

3. **Deploy the Smart Contracts**:
   Finally, to deploy your Game of Life simulation to the blockchain:
   ```bash
   npx hardhat run scripts/deploy.js
   ```

### Example Code Snippet 📝

Here’s a simple code snippet illustrating how a player can set an initial encrypted state for their Game of Life simulation:

```javascript
const { encryptState } = require('./encryptionUtils'); // hypothetical utility for encryption

async function setInitialState(initialCells) {
    const encryptedCells = encryptState(initialCells); // Encrypt the initial configuration
    const contractInstance = await GameOfLifeFhe.deployed();
    
    await contractInstance.setInitialState(encryptedCells); // function defined in the smart contract
    console.log("Initial state set successfully!");
}

// Example usage
setInitialState([ [1, 0, 0], [0, 1, 1], [0, 0, 1] ]);
```

## Acknowledgements 🤝

**Powered by Zama**: We would like to extend our heartfelt gratitude to the Zama team for their pioneering work in fully homomorphic encryption and for providing the robust open-source tools that make confidential blockchain applications possible. Their innovative technologies empower developers to build meaningful projects that prioritize user privacy and security.

By participating in the **Game of Life FHE**, you are part of a growing ecosystem that values both fun and privacy. Join us in this unique endeavor to explore the dynamic world of cellular automation!