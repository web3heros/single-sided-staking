import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { AbiCoder, MaxUint256, parseEther, ZeroAddress, ZeroHash } from 'ethers';
import { beforeEach, describe } from 'mocha';
import { ERC20Mock, StakingActionFees, StakingOverTimeReward } from 'typechain-types';
import { deployStaking, DeployStakingParams } from '../utils/contracts';
import { deployFixtures } from '../utils/fixtures';
import { latest, setNextBlockTimestamp } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { mine } from '@nomicfoundation/hardhat-network-helpers';

describe('Staking: Over Time Reward', () => {
  let erc20MockStaking$: ERC20Mock;
  let deployer: string, stakingToken: string;
  let createParams: DeployStakingParams;
  let signer0: SignerWithAddress, signer1: SignerWithAddress;

  const REWARDS = parseEther('1');
  const LOCK = 86400;

  beforeEach(async () => {
    const fixtures = await deployFixtures({ fixtures: ['DeployFactory', 'DeployMocks'] });
    ({ erc20MockStaking$ } = fixtures.contracts);
    ({ signer0, signer1 } = fixtures.accounts);
    deployer = fixtures.accounts.wallet.address;
    stakingToken = await erc20MockStaking$.getAddress();
    createParams = {
      owner: deployer,
      deployer,
      stakingToken,
      args: new AbiCoder().encode(['uint256', 'address', 'uint64'], [REWARDS, stakingToken, LOCK]),
    };
  });

  it('should initialize with config', async () => {
    // await expect(deployStaking<StakingOverTimeReward>('StakingOverTimeReward', { ...createParams, args: ZeroHash })).to
    //   .be.reverted;
    const staking$ = await deployStaking<StakingOverTimeReward>('StakingOverTimeReward', createParams);
    expect(await staking$.totalRewards()).to.eq(REWARDS);
    expect(await staking$.totalClaimed()).to.eq(0);
    expect(await staking$.lockPeriod()).to.eq(LOCK);
    expect(await staking$.timeStart()).to.eq(0);
    expect(await staking$.timeEnd()).to.eq(0);
  });

  describe('deployed by factory', () => {
    let staking$: StakingOverTimeReward;
    beforeEach(async () => {
      staking$ = await deployStaking<StakingOverTimeReward>('StakingOverTimeReward', createParams);
      await erc20MockStaking$.mint(signer0.address, parseEther('10'));
      await erc20MockStaking$.mint(signer1.address, parseEther('10'));
      await erc20MockStaking$.approve(await staking$.getAddress(), MaxUint256);
      await erc20MockStaking$.connect(signer0).approve(await staking$.getAddress(), MaxUint256);
      await erc20MockStaking$.connect(signer1).approve(await staking$.getAddress(), MaxUint256);
    });

    it('should update config', async () => {
      await expect(staking$.connect(signer0).updateConfig(createParams.args, [])).to.be.reverted;
      await expect(
        staking$.updateConfig(
          new AbiCoder().encode(['uint256', 'address', 'uint64'], [REWARDS, ZeroAddress, LOCK]),
          [],
        ),
      ).to.be.revertedWithCustomError(staking$, 'StakingOverTimeReward__AddressZero');
      await expect(
        staking$.updateConfig(new AbiCoder().encode(['uint256', 'address', 'uint64'], [0, stakingToken, 0]), []),
      ).to.be.revertedWithCustomError(staking$, 'StakingOverTimeReward__AmountZero');
      await expect(
        staking$.updateConfig(new AbiCoder().encode(['uint256', 'address', 'uint64'], [0, stakingToken, LOCK]), []),
      ).to.be.revertedWithCustomError(staking$, 'StakingOverTimeReward__AmountZero');
      await expect(
        staking$.updateConfig(new AbiCoder().encode(['uint256', 'address', 'uint64'], [REWARDS, stakingToken, 0]), []),
      ).to.be.revertedWithCustomError(staking$, 'StakingOverTimeReward__AmountZero');
      await expect(staking$.updateConfig(createParams.args, []))
        .to.emit(staking$, 'UpdateConfig')
        .withArgs(REWARDS, stakingToken, LOCK);
    });

    it('should be able to announce', async () => {
      await expect(staking$.connect(signer0).announce([])).to.be.reverted;

      const announceTx = staking$.announce([]);
      await expect(announceTx).to.emit(staking$, 'Announced');
      await expect(announceTx).to.changeTokenBalances(
        erc20MockStaking$,
        [deployer, await staking$.getAddress()],
        [parseEther('-1'), parseEther('1')],
      );
    });

    it('should have disabled features', async () => {
      await expect(staking$.enable(false, [])).to.be.revertedWithCustomError(
        staking$,
        'StakingOverTimeReward__EnablingInvalid',
      );
    });

    describe('announed', () => {
      const purge = async () => {
        const purgeTx = staking$.purge([]);
        await expect(purgeTx).to.emit(staking$, 'Purged');
        await expect(purgeTx).to.changeTokenBalances(
          erc20MockStaking$,
          [deployer, await staking$.getAddress()],
          [parseEther('1'), parseEther('-1')],
        );
      };

      beforeEach(async () => {
        await staking$.announce([]);
      });

      it('should be able to purge when announced', async () => {
        await expect(staking$.connect(signer0).purge([])).to.be.reverted;
        await purge();
      });

      it('should be able to open', async () => {
        await expect(staking$.connect(signer0).open([])).to.be.reverted;
        await expect(staking$.open([])).to.emit(staking$, 'Opened');
      });

      it('should not be able to start', async () => {
        await expect(staking$.connect(signer0).start([])).to.be.reverted;
        await expect(staking$.start([])).to.be.revertedWithCustomError(staking$, 'StakingOverTimeReward__NotStarted');
      });

      describe('opened', () => {
        beforeEach(async () => {
          await staking$.open([]);
        });

        it('should be able to purge when opened but no stake', async () => {
          await purge();
          expect(await staking$.paused()).to.be.true;
        });

        it('should be able to start', async () => {
          await expect(staking$.start([])).to.be.revertedWithCustomError(staking$, 'StakingOverTimeReward__NoStakers');

          await staking$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
          await expect(staking$.start([])).to.emit(staking$, 'Started');

          const timestamp = await latest();
          expect(await staking$.timeStart()).to.eq(timestamp);
          expect(await staking$.timeEnd()).to.eq(timestamp + LOCK);
          expect(await staking$.paused()).to.be.false;

          await expect(staking$.updateConfig(ZeroHash, [])).to.be.revertedWithCustomError(
            staking$,
            'StakingOverTimeReward__StartedAlready',
          );
        });

        it('should have disabled features', async () => {
          await expect(staking$.injectRewards(0, 0, [])).to.be.revertedWithCustomError(
            staking$,
            'StakingOverTimeReward__InjectRewardsInvalid',
          );
          await expect(staking$.restake([])).to.be.revertedWithCustomError(
            staking$,
            'StakingOverTimeReward__RestakeInvalid',
          );
        });

        describe('started', () => {
          beforeEach(async () => {
            await staking$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
            await staking$.connect(signer1).deposit(signer1.address, parseEther('2'), parseEther('2'), []);
            await staking$.start([]);
          });

          it('should not be able to purge when started', async () => {
            await expect(staking$.purge([])).to.be.revertedWithCustomError(
              staking$,
              'StakingOverTimeReward__HasStakers',
            );
          });

          it('should have rewards pending while progressing', async () => {
            let timestamp = await latest();
            expect(await staking$.getPendingRewards(signer0.address)).to.eq(0);
            expect(await staking$.getPendingRewards(signer1.address)).to.eq(0);

            await setNextBlockTimestamp(timestamp + LOCK / 2);
            await mine(1);

            expect(await staking$.getPendingRewards(signer0.address)).to.eq(parseEther('0.166666666666666666'));
            expect(await staking$.getPendingRewards(signer1.address)).to.eq(parseEther('0.333333333333333333'));

            await setNextBlockTimestamp(timestamp + LOCK);
            await mine(1);

            expect(await staking$.getPendingRewards(signer0.address)).to.eq(parseEther('0.333333333333333333'));
            expect(await staking$.getPendingRewards(signer1.address)).to.eq(parseEther('0.666666666666666666'));
          });

          it('should claim pending rewards while progressing', async () => {
            let timestamp = await latest();
            await setNextBlockTimestamp(timestamp + LOCK / 2 - 1); // -1 because tx add 1 second to block timestamp
            await mine(1);

            {
              const claimTx = staking$.connect(signer0).claimRewards(signer0.address, []);
              await expect(claimTx)
                .to.emit(staking$, 'Claim')
                .withArgs(signer0.address, parseEther('0.166666666666666666'));
              await expect(claimTx).to.changeTokenBalances(
                erc20MockStaking$,
                [await staking$.getAddress(), signer0.address],
                [parseEther('-0.166666666666666666'), parseEther('0.166666666666666666')],
              );
            }
            expect(await staking$.getPendingRewards(signer0.address)).to.eq(0);
            expect(await staking$.getClaimedRewards(signer0.address)).to.eq(parseEther('0.166666666666666666'));

            await expect(staking$.connect(signer0).claimRewards(ZeroAddress, [])).to.be.revertedWithCustomError(
              staking$,
              'StakingOverTimeReward__AddressZero',
            );
          });

          it('should not be able to deposit after start', async () => {
            await expect(
              staking$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []),
            ).to.be.revertedWithCustomError(staking$, 'StakingOverTimeReward__StartedAlready');
          });

          it('should not be able to withdraw before finish', async () => {
            await expect(staking$.connect(signer0).withdraw(signer0.address, 0, [])).to.be.revertedWithCustomError(
              staking$,
              'StakingOverTimeReward__NotFinished',
            );
          });

          it('should be able to withdraw after finish', async () => {
            let timestamp = await latest();
            await setNextBlockTimestamp(timestamp + LOCK - 2); // -1 because tx add 1 second to block timestamp
            await mine(1);

            await expect(staking$.connect(signer0).withdraw(signer0.address, 0, [])).to.be.revertedWithCustomError(
              staking$,
              'StakingOverTimeReward__NotFinished',
            );

            await mine(1);

            const withdrawTx = staking$.connect(signer0).withdraw(signer0.address, 0, []);
            await expect(withdrawTx)
              .to.emit(staking$, 'Claim')
              .withArgs(signer0.address, parseEther('0.333333333333333333'));
            await expect(withdrawTx).to.emit(staking$, 'Update').withArgs(signer0.address, parseEther('-1'));

            await mine(1);
            await expect(staking$.connect(signer0).withdraw(signer0.address, 0, [])).to.be.revertedWithCustomError(
              staking$,
              'Staking__AmountZero',
            );
          });

          it('should be able to claim rewards after finish', async () => {
            let timestamp = await latest();
            await setNextBlockTimestamp(timestamp + LOCK); // -1 because tx add 1 second to block timestamp
            await mine(1);
            await staking$.connect(signer0).claimRewards(signer0.address, []);
            await staking$.connect(signer0).claimRewards(signer0.address, []);
            const withdrawTx = staking$.connect(signer0).withdraw(signer0.address, 0, []);
            await expect(withdrawTx).to.not.emit(staking$, 'Claim');
            await expect(withdrawTx).to.emit(staking$, 'Update').withArgs(signer0.address, parseEther('-1'));
          });
        });
      });
    });
  });
});
