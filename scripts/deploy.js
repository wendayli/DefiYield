const hre = require("hardhat");
const fs = require("fs");

async function main() {
  // Después del despliegue
// Asegura que el owner tenga 100 LP tokens
  const [owner] = await hre.ethers.getSigners();
  const lpToken = await hre.ethers.getContractAt("LPToken", LP_ADDRESS);
  const balance = await lpToken.balanceOf(owner.address);
  console.log("Balance de LP del owner:", ethers.formatEther(balance)); // Debe ser 100

  const DappToken = await hre.ethers.getContractFactory("DappToken");
  const dappToken = await DappToken.deploy();
  await dappToken.waitForDeployment();
  console.log("DappToken desplegado en:", await dappToken.getAddress());

  const LPToken = await hre.ethers.getContractFactory("LPToken");
  await lpToken.waitForDeployment();
  console.log("LPToken desplegado en:", await lpToken.getAddress());

  const TokenFarm = await hre.ethers.getContractFactory("TokenFarm");
  const tokenFarm = await TokenFarm.deploy(await dappToken.getAddress(), await lpToken.getAddress());
  await tokenFarm.waitForDeployment();
  console.log("TokenFarm desplegado en:", await tokenFarm.getAddress());

  // Transferir ownership del DappToken al TokenFarm
  await dappToken.transferOwnership(await tokenFarm.getAddress());
  console.log("✅ Ownership de DappToken transferido a TokenFarm");

  // Guardar direcciones
  const addresses = {
    DappToken: await dappToken.getAddress(),
    LPToken: await lpToken.getAddress(),
    TokenFarm: await tokenFarm.getAddress()
  };
  fs.writeFileSync("deployment.json", JSON.stringify(addresses, null, 2));
  console.log("✅ Direcciones guardadas en deployment.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });