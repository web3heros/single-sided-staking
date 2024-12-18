import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts, deployments: { deploy, log } }: HardhatRuntimeEnvironment) => {
  const { deployer } = await getNamedAccounts();

  log(`------------------------------------------------------------------------`);
  log(`🚀 Start Deploy Mocks`);
  log(`------------------------------------------------------------------------`);

  await deploy('ERC20MockStaking', { from: deployer, contract: 'ERC20Mock' });
  await deploy('ERC20MockReward', { from: deployer, contract: 'ERC20Mock' });
  await deploy('StakingMock', { from: deployer });

  log(`------------------------------------------------------------------------`);
  log(`🏁 Finished Deploy Mocks`);
};

func.tags = ['DeployMocks'];
func.id = 'deploymocks';

export default func;
