import { expect } from 'chai';
import { ZeroHash, zeroPadValue } from 'ethers';
import { beforeEach, describe } from 'mocha';
import { ERC20Mock, StakingCustomReward } from 'typechain-types';
import { deployStaking, DeployStakingParams } from './../utils/contracts';
import { deployFixtures } from './../utils/fixtures';

describe('Staking: Custom Reward', () => {
  let erc20MockStaking$: ERC20Mock, erc20MockReward$: ERC20Mock;
  let deployer: string;

  beforeEach(async () => {
    const fixtures = await deployFixtures({ fixtures: ['DeployFactory', 'DeployMocks'] });
    ({ erc20MockStaking$, erc20MockReward$ } = fixtures.contracts);
    deployer = fixtures.accounts.wallet.address;
  });

  it('should have a custom reward token address', async () => {
    const stakingToken = await erc20MockStaking$.getAddress();
    const createParams: DeployStakingParams = {
      owner: deployer,
      deployer,
      stakingToken,
      args: ZeroHash,
    };
    await expect(deployStaking<StakingCustomReward>('StakingCustomReward', createParams)).to.be.reverted;
    const staking$ = await deployStaking<StakingCustomReward>('StakingCustomReward', {
      ...createParams,
      args: zeroPadValue(await erc20MockReward$.getAddress(), 32),
    });
    expect(await staking$.rewardToken()).to.eq(await erc20MockReward$.getAddress());
  });
});
