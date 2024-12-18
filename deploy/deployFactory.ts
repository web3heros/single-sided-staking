import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { templates } from './../utils/contracts';

const func: DeployFunction = async ({ getNamedAccounts, deployments: { deploy, log } }: HardhatRuntimeEnvironment) => {
  const { deployer } = await getNamedAccounts();

  log(`------------------------------------------------------------------------`);
  log(`🚀 Start Deploy Factories`);
  log(`------------------------------------------------------------------------`);

  for (const templatesContractName of templates) {
    const templateContract = await ethers.getContract(templatesContractName);
    const { address } = await deploy(`${templatesContractName}Factory`, {
      from: deployer,
      contract: 'StakingFactory',
      args: [await templateContract.getAddress()],
    });
    log(`deployed ${templatesContractName}Factory on ${address}`);
  }

  log(`------------------------------------------------------------------------`);
  log(`🏁 Finished Deploy Factories`);
};

func.tags = ['DeployFactory'];
func.dependencies = ['DeployTemplates'];
func.id = 'deployfactory';

export default func;
