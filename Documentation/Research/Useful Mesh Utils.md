## Mesh SDK Functions for Plutus Blueprint Artifact Generation

Building the Blueprint App involves parsing a CIP-57 Plutus contract blueprint (the plutus.json output from Aiken) and producing on-chain artifacts (script CBOR, script hash, addresses, etc.) for each validator. The Cardano Mesh SDK provides various utilities to streamline this process. Below, we detail the key functions, classes, and processes from Mesh that will be useful in implementing the core flow of the app, especially with regard to handling compile-time parameters and generating script artifacts.

### Mesh Blueprint Utility Classes (Spending, Minting, Withdrawal)

Mesh includes built-in Blueprint classes for handling different validator types. These classes encapsulate serialization of scripts (including parameter application) and provide easy access to common artifact outputs:

- **SpendingBlueprint** – For spending validators (payment scripts). Constructed with plutusVersion, networkId, and optionally a stakeKeyHash (for addresses with a staking part). After providing the compiled code and any parameters, it exposes:
  - **hash** – The script's Blake2b-224 hash (used in addresses)
  - **cbor** – The script's CBOR bytes (double-encoded UPLC ready for on-chain)
  - **address** – The bech32 script address (payment credential = script hash, plus stake credential if provided)

- **MintingBlueprint** – For minting policy scripts (native token policies). Constructed with plutusVersion. After setup it provides:
  - **hash** – The policy ID, which is the script hash (blake2b-224 of the script CBOR)
  - **cbor** – The script CBOR for the minting policy
  - _(No address is associated with a minting script; the hash/policy ID is the identifier for tokens.)_

- **WithdrawalBlueprint** – For reward withdrawal scripts (stake scripts controlling reward withdrawals). Constructed with plutusVersion and networkId. After providing code and parameters, it gives:
  - **hash** – The script hash (blake2b-224)
  - **cbor** – The script CBOR bytes
  - **address** – The reward account address (stake address) controlled by this script

Each Blueprint class provides two main methods to input the script code:

- `.paramScript(compiledCode, params[], dataType)` - Apply one or more compile-time parameters to the compiledCode (which is the base script from the JSON). You pass an array of parameter values and specify the format of these values (e.g., "Mesh" for Mesh's Data types). This yields a fully parameterized script internally.

- `.noParamScript(compiledCode)` - Use if the validator has no compile-time parameters. This simply loads the compiled code as is.

After calling one of the above, the blueprint instance's properties (hash, cbor, address) become available for use. For example, using a SpendingBlueprint with no parameters:
```
const blueprint = new SpendingBlueprint("V2", 0, stakeHash);
blueprint.noParamScript(demoCompiledCode);
console.log(blueprint.hash, blueprint.cbor, blueprint.address);
```
And with parameters:
```
const blueprint = new MintingBlueprint("V2");
blueprint.paramScript(
  demoCompiledCode,
  [ mPubKeyAddress('...paymentKeyHash...', '...stakeKeyHash...'), 100 ],
  "Mesh"
);
console.log(blueprint.hash, blueprint.cbor); // policy ID and CBOR 
```
[oai_citation:17‡meshjs.dev](https://meshjs.dev/apis/utilities/blueprints#:~:text=demoCompiledCode%2C%20,Mesh%20data%20type) [oai_citation:18‡meshjs.dev](https://meshjs.dev/apis/utilities/blueprints#:~:text=const%20policyId%20%3D%20blueprint,cbor)

ℹ️ Note: As of now, Mesh provides specific classes for spending, minting, and withdrawal purposes. Certificate scripts (stake certificate validators) are not explicitly covered by a separate class in the docs. However, you can still handle them by applying parameters (if any) and using generic functions to get the hash and CBOR (similar to minting scripts, a cert script’s hash would be its identifier). The same underlying utilities can be used in such cases.

Applying Compile-Time Parameters (CIP-57 Compliance)

CIP-57 (Plutus Contract Blueprint) defines that a validator can have compile-time parameters which must be instantiated to obtain the final on-chain script code. Mesh's `applyParamsToScript` function (and the Blueprint classes built on it) handle this instantiation:

- **`applyParamsToScript(compiledCode, paramsArray)`** - Low-level function that applies the given parameters to a Plutus script template. It returns the fully applied script in CBOR (with the required double-CBOR encoding for Plutus scripts). Even if no parameters are needed, calling this will ensure the script is correctly encoded per CIP-57 (it effectively wraps the script in the expected CBOR envelope).

For example:
```
const scriptCbor = applyParamsToScript(blueprint.validators[0].compiledCode, []); 
// [] since no params in this case 
```
[oai_citation:22‡aiken-lang.org](https://aiken-lang.org/example--hello-world/end-to-end/mesh#:~:text=export%20function%20getScript%28%29%20,)


Mesh’s documentation notes that applyParamsToScript “allows you to create a custom CIP-57 compliant script”, meaning it handles embedding the parameters and performing the double CBOR serialization as specified by CIP-57 ￼.

When using the Blueprint classes, you do not need to call applyParamsToScript directly – paramScript() does it internally. However, if not using the class for a certain case, you can call this function to get the final scriptCbor.

Why this matters: The input plutus.json will list any required parameters for each validator (under a "parameters" schema) that must be provided to generate the final script code ￼. For instance, a common case is a minting policy that has a parameter for an issuing public key or a UTxO reference. These parameters are part of the script’s logic and influence the script hash. They must be applied consistently to ensure deterministic artifact generation. Mesh’s utilities directly support this by taking in those values and producing the deterministic CBOR and hash.

Generating Script Hashes and Addresses

Once a Plutus script is fully parameterized and serialized, you'll need its script hash and often a bech32 address (for spending and withdrawal scripts):

- `resolveScriptHash(code, version)` – This function computes the blake2b-224 hash of a given Plutus script. You can supply the raw scriptCode (CBOR bytes, e.g. output of applyParamsToScript) and the Plutus version ("V1", "V2", etc.), and it returns the 28-byte script hash (commonly used as the policy ID for minting scripts, or as the payment credential hash for addresses) ￼. For example, after applying params:
```
const scriptCode = applyParamsToScript(oneTimeMintingPolicy, [ mTxOutRef(txHash, index) ]);
const policyId = resolveScriptHash(scriptCode, "V2"); // policyId is the script hash 
```
[oai_citation:26‡meshjs.dev](https://meshjs.dev/apis/txbuilder/minting#:~:text=const%20scriptCode%20%3D%20applyParamsToScript%28oneTimeMintingPolicy%2C%20,0%5D%3F.input.outputIndex%21%29%2C)

If using Blueprint classes, this hash is available via the .hash property as noted earlier (e.g., blueprint.hash).

- **`resolvePlutusScriptAddress(plutusScript, networkId, stakeKeyHash?)`** - A utility to derive a spending script address (bech32) from a Plutus script. You provide a Plutus script object ({ code: <scriptCbor>, version: "<Vn>" }), the network ID (e.g., 1 for mainnet, 0 for testnet), and optionally a stake credential hash, and it returns the bech32 address ￼. In practice, the Blueprint class does this for you (SpendingBlueprint.address uses the networkId and stake provided). For example:
```
const script = { code: scriptCbor, version: "V2" };
const scriptAddress = resolvePlutusScriptAddress(script, 0);  // 0 = testnet in this context 
```
[oai_citation:28‡meshjs.dev](https://meshjs.dev/aiken/transactions#:~:text=code%3A%20scriptCbor%2C%20version%3A%20,script%2C%20scriptAddress)

This address corresponds to an address where the payment part is locked by the script (and it includes a stake part if one was given). Mesh's serializePlutusScript is a related function that also produces an address; it serializes a Plutus script and returns an object containing the bech32 address (and internally, the CBOR) [oai_citation:29‡meshjs.dev].

- For withdrawal (stake) scripts, the address generated is a reward account address. In the Blueprint, WithdrawalBlueprint.address gives the reward address controlled by the script [oai_citation:30‡meshjs.dev]. This is similar to the spending script address but in the context of the stake key hash namespace.

Using these functions ensures the addresses and hashes are computed exactly as the Cardano ledger expects. For instance, the policy ID for a native token is simply the script hash of its minting policy script ￼, and Mesh’s resolveScriptHash or blueprint .hash will give that to you directly. Likewise, script addresses (which are often needed to send funds to the script) are derived from the hash with the network prefix ￼.

Mesh Data Helpers for Parameter Values

If a validator has compile-time parameters, you need to supply values in the correct format. The CIP-57 blueprint describes each parameter's schema (type). Mesh offers Data construction helpers (all prefixed with `m`) to create parameter values that match the expected on-chain data format [^1] [^2]. These are especially useful for non-primitive types:

`mPubKeyAddress(paymentKeyHash, stakeKeyHash?)`
Constructs an address data object (`Mesh PubKeyAddress` type) from a given payment pubkey hash and an optional stake key hash. Use this when a parameter expects an address or key hash.

**Example:**

These helpers return objects in Mesh’s internal Data format which corresponds to Plutus Data. They can be passed into applyParamsToScript or Blueprint.paramScript when "Mesh" type is specified, and Mesh will handle converting them to the proper CBOR-encoded datum needed by the script ￼. Primitive types like integers or byte strings can be passed as normal JavaScript number, bigint, or hex string, respectively – Mesh will interpret those correctly as well (booleans use mBool(true/false) if needed) ￼.

Example: If a script has two parameters – a public key hash and an integer – you might do:
```
const paramValues = [ mPubKeyAddress(userPaymentKeyHash, userStakeKeyHash), 42 ];
blueprint.paramScript(compiledCode, paramValues, "Mesh");
```

This applies a structured address (constructed from the user’s key hashes) and an integer 42 to the script ￼. The result is a fully applied script whose hash and address now incorporate those parameters.

Ensuring Consistent Parameter Application Across Validators

In some contracts, the same compile-time parameter is used by multiple validators (for example, a collection of scripts might all share an “owner” key hash or a common deadline constant). It is crucial to apply the exact same value for such parameters across all relevant validators to maintain consistency and determinism. If the blueprint JSON defines a parameter with the same name or schema in multiple validators, your app should recognize that and prompt the user for the value once, then reuse it for each validator.

While Mesh will compute the artifacts for each script independently, it’s up to the app logic to ensure that, say, every validator expecting an “ownerPubKey” gets the same hash input. This guarantees that the resulting script hashes remain consistent with one another and with any off-chain expectations. In practice, this means when parsing the plutus.json, identify parameters by their names or positions under each validator’s "parameters" schema and unify those inputs in the UI.

By using the Mesh functions above to apply the identical parameter values, you ensure the script hashes and addresses derived from those scripts are deterministic and match across the board. (For instance, two spending scripts that both take an OwnerPubKey parameter will each produce a different hash if given different keys; using one key for both yields uniform behavior.)

Putting It Together

Workflow recap: For each validator in the blueprint file (spending, minting, certifying, withdrawing):

1. Parse the blueprint JSON to get the validator's type, compiled code (CBOR hex), and parameter schema (if any)
2. Obtain parameter values from the user for any required compile-time parameters. Use Mesh's data helpers (m... functions) to construct complex values (addresses, OutRefs, etc.) as needed
3. Apply parameters to the compiled code using Blueprint.paramScript or applyParamsToScript. This yields the final scriptCbor bytes for the validator
4. Retrieve artifact outputs:
   - Compute the script hash – either via the Blueprint's .hash or using resolveScriptHash(scriptCbor, version). This is the script address credential or policy ID
   - Compute the script address if applicable – via Blueprint .address or resolvePlutusScriptAddress (for spending scripts, using network and optional stake key). For withdrawal scripts, use the reward address output. (Minting scripts don't have an address; the hash serves as the policy ID)
5. Repeat for all validators, taking care to reuse the same parameter inputs for those that share the same underlying parameter (for consistency)

By leveraging these Mesh SDK functions, our Blueprint App can efficiently convert an Aiken-generated plutus.json blueprint into ready-to-use on-chain artifacts. This approach abstracts away low-level details – like CBOR encoding and hashing – and adheres to the CIP-57 standard for Plutus contract specification ￼, ensuring interoperability with other tools and wallets. All artifacts (script CBOR, hashes, addresses) will be deterministically derived and immediately usable in Cardano transactions or integration with wallet software.

Sources:
* Mesh SDK Documentation – Blueprints Utility Classes [^1] [^2] [^3] and Aiken Integration Guide [^4] [^5] (showing usage of applyParamsToScript and script address resolution).
* CIP-57: Plutus Contract Blueprint (Cardano Improvement Proposal) – definition of parameters and compiled code in contract blueprints [^6].
* Mesh SDK Documentation – Serializers & Resolvers [^7] [^8] and Mesh Data Helpers [^9] [^10] (utilities for constructing addresses, pubkey hashes, TxOutRefs, etc. for parameters).