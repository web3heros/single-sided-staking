import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { templates } from './../utils/contracts';

const func: DeployFunction = async ({ getNamedAccounts, deployments: { deploy, log } }: HardhatRuntimeEnvironment) => {
  const { deployer } = await getNamedAccounts();

  log(`------------------------------------------------------------------------`);
  log(`🚀 Start Deploy Templates`);
  log(`------------------------------------------------------------------------`);

  for (const templateContractName of templates) await deploy(templateContractName, { from: deployer });

  log(`------------------------------------------------------------------------`);
  log(`🏁 Finished Deploy Templates`);
};

func.tags = ['DeployTemplates'];
func.id = 'deploytemplates';

export default func;
