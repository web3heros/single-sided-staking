import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { mine } from '@nomicfoundation/hardhat-network-helpers';
import { latest, setNextBlockTimestamp } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { expect } from 'chai';
import { AbiCoder, MaxUint256, parseEther, ZeroAddress, ZeroHash } from 'ethers';
import { beforeEach, describe } from 'mocha';
import { ERC20Mock, StakingTimeLock } from 'typechain-types';
import { deployStaking, DeployStakingParams } from '../utils/contracts';
import { deployFixtures } from '../utils/fixtures';

describe('Staking: Time Lock', () => {
  const LOCK = 86400;
  let erc20MockStaking$: ERC20Mock;
  let deployer: string, stakingToken: string;
  let signer0: SignerWithAddress;
  let createParams: DeployStakingParams;

  beforeEach(async () => {
    const fixtures = await deployFixtures({ fixtures: ['DeployFactory', 'DeployMocks'] });
    ({ erc20MockStaking$ } = fixtures.contracts);
    ({ signer0 } = fixtures.accounts);
    deployer = fixtures.accounts.wallet.address;
    stakingToken = await erc20MockStaking$.getAddress();
    createParams = {
      stakingToken,
      deployer,
      owner: deployer,
      args: ZeroHash,
    };
  });

  it('should have a lock period', async () => {
    const coder = new AbiCoder();
    await expect(deployStaking<StakingTimeLock>('StakingTimeLock', createParams)).to.be.reverted;
    await expect(deployStaking<StakingTimeLock>('StakingTimeLock', { ...createParams, stakingToken: ZeroAddress })).to
      .be.reverted;
    await expect(
      deployStaking<StakingTimeLock>('StakingTimeLock', {
        ...createParams,
        args: coder.encode(['address', 'uint64'], [ZeroAddress, 0]),
      }),
    ).to.be.reverted;
    await expect(
      deployStaking<StakingTimeLock>('StakingTimeLock', {
        ...createParams,
        args: coder.encode(['address', 'uint64'], [stakingToken, 0]),
      }),
    ).to.be.reverted;
    const staking$ = await deployStaking<StakingTimeLock>('StakingTimeLock', {
      ...createParams,
      args: coder.encode(['address', 'uint64'], [stakingToken, LOCK]),
    });
    expect(await staking$.rewardToken()).to.eq(stakingToken);
    expect(await staking$.lockPeriod()).to.eq(LOCK);
  });

  describe('deployed by factory', () => {
    let staking$: StakingTimeLock;
    beforeEach(async () => {
      const coder = new AbiCoder();
      staking$ = await deployStaking<StakingTimeLock>('StakingTimeLock', {
        ...createParams,
        args: coder.encode(['address', 'uint64'], [stakingToken, LOCK]),
      });

      await erc20MockStaking$.mint(signer0.address, parseEther('10'));
      await erc20MockStaking$.approve(await staking$.getAddress(), MaxUint256);
      await erc20MockStaking$.connect(signer0).approve(await staking$.getAddress(), MaxUint256);
      await staking$.enable(true, []);
    });

    it('should lock a stake on deposit', async () => {
      await staking$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);

      const blocktime = await latest();
      expect(await staking$.getLockOf(signer0.address)).to.deep.eq([blocktime, blocktime + LOCK]);
    });

    describe('stake locked', () => {
      beforeEach(async () => {
        await staking$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
      });

      it('should not withdraw a stake during lock', async () => {
        await expect(
          staking$.connect(signer0).withdraw(signer0.address, parseEther('1'), []),
        ).to.be.revertedWithCustomError(staking$, 'StakingTimeLock__Locked');
      });

      describe('released', () => {
        beforeEach(async () => {
          await setNextBlockTimestamp((await latest()) + LOCK);
          await mine(1);
        });

        it('should withdraw a stake after lock', async () => {
          await expect(staking$.connect(signer0).withdraw(signer0.address, parseEther('1'), [])).to.emit(
            staking$,
            'Update',
          );
        });

        it('should renew a lock of a when deposit', async () => {
          await staking$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
          const blocktime = await latest();
          expect(await staking$.getLockOf(signer0.address)).to.deep.eq([blocktime, blocktime + LOCK]);
        });

        it('should renew the lock when restaked', async () => {
          await staking$.injectRewards(parseEther('0.1'), 0, []);
          await staking$.connect(signer0).restake([]);
          const blocktime = await latest();
          expect(await staking$.getLockOf(signer0.address)).to.deep.eq([blocktime, blocktime + LOCK]);
        });
      });
    });
  });
});
