# End-to-End Validator Deployment Process

## High-level Plan
A complete solution that handles the entire process from:
- Adding parameters to validators
- Generating on-chain artifacts 
- Deploying reference scripts
- Securely storing reference transaction hashes, indexes and validator details

## User Steps

### 1. On-Chain Artifacts & Parameters
**Process**: Upload JSON file → Parameterize (optional) → Generate On-chain Artifacts

1. **Upload Plutus JSON**
   - User uploads plutus.json file
   - System parses and displays:
     - Validator names
     - Purposes
     - Parameters and their types

2. **Parameter Handling**
   - For parameterized validators:
     - Check if parameters are already provided
     - If not, display form to input parameters
   - For non-parameterized validators:
     - Proceed to next step

3. **Artifact Generation**
   - Display all on-chain artifacts based on purpose:
     - CBOR
     - Hex/Policy
     - Address
     - Other relevant artifacts

### 2. Reference Scripts
**Process**: Add Address → Build/Sign Transaction → Get Transaction Details

4. **Address Input**
   - Add address for storing reference UTXOs

5. **Transaction Creation**
   - Build transaction to:
     - Create reference UTXOs
     - Pay transaction fees
     - Cover service fees

6. **Transaction Details**
   - Receive transaction hashes
   - Get transaction indices for each script

### 3. Data Storage
**Process**: Store Reference Details (Optional Subscription)

7. **Store Reference Information**
   - Automatic storage:
     - Reference transaction hashes
     - On-chain artifacts
   - User input storage:
     - GitHub links to validators
     - Parameter values (if our service is not used)
     - Notes
     - Additional details