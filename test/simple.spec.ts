import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { MaxUint256, parseEther, ZeroAddress, ZeroHash } from 'ethers';
import { ethers, getNamedAccounts } from 'hardhat';
import { ERC20Mock, StakingSimple } from 'typechain-types';
import { deployStaking } from './../utils/contracts';
import { deployFixtures } from './../utils/fixtures';

describe('Staking: Simple', () => {
  let erc20MockStaking$: ERC20Mock;
  let stakingSimple$: StakingSimple;
  let stakingSimpleSingleton$: StakingSimple;
  let deployer: string;
  let stakingToken: string;
  let signer0: SignerWithAddress;
  let signer1: SignerWithAddress;

  beforeEach(async () => {
    const fixtures = await deployFixtures({ fixtures: ['DeployFactory', 'DeployMocks'] });
    ({ erc20MockStaking$ } = fixtures.contracts);
    ({ signer0, signer1 } = fixtures.accounts);
    deployer = fixtures.accounts.wallet.address;
    stakingToken = await erc20MockStaking$.getAddress();
    stakingSimpleSingleton$ = await ethers.getContract('StakingSimple');
  });

  it('should deploy successfully', async () => {
    expect(await stakingSimpleSingleton$.getAddress()).to.be.not.empty;
  });

  it('should not be initializable', async () => {
    await expect(stakingSimpleSingleton$.initialize(ZeroAddress, ZeroAddress, ZeroHash)).to.be.revertedWithCustomError(
      stakingSimpleSingleton$,
      'InvalidInitialization',
    );
  });

  it('should not have a working action', async () => {
    await expect(stakingSimpleSingleton$.deposit(ZeroAddress, 0, 0, [])).to.be.reverted;
    await expect(stakingSimpleSingleton$.withdraw(ZeroAddress, 0, [])).to.be.reverted;
    await expect(stakingSimpleSingleton$.restake([])).to.be.reverted;
    await expect(stakingSimpleSingleton$.claimRewards(ZeroAddress, [])).to.be.reverted;
    await expect(stakingSimpleSingleton$.injectRewards(0, 0, [])).to.be.reverted;
  });

  describe('deployed by factory', () => {
    beforeEach(async () => {
      stakingSimple$ = await deployStaking<StakingSimple>('StakingSimple', {
        stakingToken,
        deployer,
        owner: deployer,
        args: ZeroHash,
      });

      await erc20MockStaking$.mint(signer0.address, parseEther('10'));
      await erc20MockStaking$.mint(signer1.address, parseEther('10'));

      await erc20MockStaking$.approve(await stakingSimple$.getAddress(), MaxUint256);
      await erc20MockStaking$.connect(signer0).approve(await stakingSimple$.getAddress(), MaxUint256);
      await erc20MockStaking$.connect(signer1).approve(await stakingSimple$.getAddress(), MaxUint256);
    });

    it('should be initialized', async () => {
      await expect(stakingSimple$.initialize(ZeroAddress, ZeroAddress, ZeroHash)).to.be.revertedWithCustomError(
        stakingSimple$,
        'InvalidInitialization',
      );
      expect(await stakingSimple$.staked()).to.eq(0);
      expect(await stakingSimple$.stakingToken()).to.eq(stakingToken);
      expect(await stakingSimple$.rewardToken()).to.eq(stakingToken);
    });

    it('should be disabled by default', async () => {
      expect(await stakingSimple$.paused()).to.be.true;
    });

    it('should be enabled', async () => {
      await expect(stakingSimple$.enable(true, []), 'enable').to.emit(stakingSimple$, 'Unpaused');
      expect(await stakingSimple$.paused()).to.be.false;
    });

    it('should be disabled', async () => {
      await stakingSimple$.enable(true, []);
      await expect(stakingSimple$.enable(false, []), 'disable').to.emit(stakingSimple$, 'Paused');
      expect(await stakingSimple$.paused()).to.be.true;
    });

    it('should not be enabled by a non-owner', async () => {
      await expect(stakingSimple$.connect(signer0).enable(true, [])).to.be.revertedWithCustomError(
        stakingSimple$,
        'OwnableUnauthorizedAccount',
      );
    });

    describe('and enabled', () => {
      beforeEach(async () => {
        await stakingSimple$.enable(true, []);
      });

      it('should be able to deposit', async () => {
        await expect(
          stakingSimple$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []),
          'happy path',
        )
          .to.emit(stakingSimple$, 'Update')
          .withArgs(signer0.address, parseEther('1'));

        expect(await stakingSimple$.staked()).to.eq(parseEther('1'));
      });

      it('should be able to withdraw', async () => {
        await stakingSimple$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
        await expect(stakingSimple$.connect(signer0).withdraw(signer0.address, parseEther('1'), []), 'happy path')
          .to.emit(stakingSimple$, 'Update')
          .withArgs(signer0.address, parseEther('-1'));
      });

      it('should be able to inject rewards', async () => {
        await stakingSimple$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
        await stakingSimple$.connect(signer1).deposit(signer1.address, parseEther('2'), parseEther('2'), []);

        expect(await stakingSimple$.staked()).to.eq(parseEther('3'));
        await expect(stakingSimple$.injectRewards(parseEther('1'), parseEther('1'), []), 'happy path')
          .to.emit(stakingSimple$, 'InjectRewards')
          .withArgs(deployer, parseEther('1'), parseEther('1'));
      });

      it('should be able to claim rewards', async () => {
        await stakingSimple$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
        await stakingSimple$.connect(signer1).deposit(signer1.address, parseEther('2'), parseEther('2'), []);
        await stakingSimple$.injectRewards(parseEther('1'), parseEther('1'), []);

        await expect(stakingSimple$.connect(signer0).claimRewards(signer0.address, []), 'happy path')
          .to.emit(stakingSimple$, 'Claim')
          .withArgs(signer0.address, parseEther('0.333333333333333333'));
      });

      it('should not claim when there is no rewards', async () => {
        await stakingSimple$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
        await stakingSimple$.connect(signer0).claimRewards(signer0.address, []);
      });

      it('should restake', async () => {
        await stakingSimple$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
        await stakingSimple$.connect(signer1).deposit(signer1.address, parseEther('2'), parseEther('2'), []);
        await stakingSimple$.injectRewards(parseEther('1'), parseEther('1'), []);

        const restakeTxSigner0 = stakingSimple$.connect(signer0).restake([]);
        await expect(restakeTxSigner0, 'happy path')
          .to.emit(stakingSimple$, 'Claim')
          .withArgs(signer0.address, parseEther('0.333333333333333333'));
        await expect(restakeTxSigner0, 'happy path')
          .to.emit(stakingSimple$, 'Restaked')
          .withArgs(signer0.address, parseEther('0.333333333333333333'));

        const restakeTxSigner1 = stakingSimple$.connect(signer1).restake([]);
        await expect(restakeTxSigner1, 'happy path')
          .to.emit(stakingSimple$, 'Claim')
          .withArgs(signer1.address, parseEther('0.666666666666666666'));
        await expect(restakeTxSigner1, 'happy path')
          .to.emit(stakingSimple$, 'Restaked')
          .withArgs(signer1.address, parseEther('0.666666666666666666'));
      });

      it('should return no reward when no stake available', async () => {
        expect(await stakingSimple$.getPendingRewards(signer1.address)).to.eq(0);
      });

      describe('with payments', () => {
        it('should pay referrals for deposit', async () => {
          const deposit = stakingSimple$
            .connect(signer0)
            .deposit(signer0.address, parseEther('1'), parseEther('1'), [deployer], { value: parseEther('1') });
          await expect(deposit).to.emit(stakingSimple$, 'ServiceFee').withArgs(deployer, parseEther('1'));
          await expect(deposit).to.changeEtherBalances(
            [signer0.address, deployer],
            [parseEther('-1'), parseEther('1')],
          );

          const deposit2 = stakingSimple$
            .connect(signer0)
            .deposit(signer0.address, parseEther('1'), parseEther('1'), [deployer, signer1.address], {
              value: parseEther('1'),
            });
          await expect(deposit2).to.emit(stakingSimple$, 'ServiceFee').withArgs(deployer, parseEther('0.5'));
          await expect(deposit2).to.emit(stakingSimple$, 'ServiceFee').withArgs(signer1.address, parseEther('0.5'));
          await expect(deposit2).to.changeEtherBalances(
            [signer0.address, deployer, signer1.address],
            [parseEther('-1'), parseEther('0.5'), parseEther('0.5')],
          );
        });

        it('should pay referrals for withdraw', async () => {
          await stakingSimple$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
          await expect(
            stakingSimple$
              .connect(signer0)
              .withdraw(signer0.address, parseEther('1'), [deployer], { value: parseEther('1') }),
          ).to.changeEtherBalances([signer0.address, deployer], [parseEther('-1'), parseEther('1')]);
        });

        it('should pay referrals for inject rewards', async () => {
          await stakingSimple$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
          await expect(
            stakingSimple$
              .connect(signer0)
              .injectRewards(parseEther('1'), parseEther('1'), [deployer], { value: parseEther('1') }),
          ).to.changeEtherBalances([signer0.address, deployer], [parseEther('-1'), parseEther('1')]);
        });

        it('should pay referrals for restake', async () => {
          await stakingSimple$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
          await stakingSimple$.connect(signer0).injectRewards(parseEther('1'), parseEther('1'), []);
          await expect(
            stakingSimple$.connect(signer0).restake([deployer], { value: parseEther('1') }),
          ).to.changeEtherBalances([signer0.address, deployer], [parseEther('-1'), parseEther('1')]);
        });

        it('should pay referrals for claim rewards', async () => {
          await stakingSimple$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
          await stakingSimple$.connect(signer0).injectRewards(parseEther('1'), parseEther('1'), []);
          await expect(
            stakingSimple$.connect(signer0).claimRewards(signer0.address, [deployer], { value: parseEther('1') }),
          ).to.changeEtherBalances([signer0.address, deployer], [parseEther('-1'), parseEther('1')]);
        });

        it('should pay referrals for enable', async () => {
          const tx = stakingSimple$.enable(false, [signer1.address], { value: parseEther('1') });
          await expect(tx).to.emit(stakingSimple$, 'Paused');
          await expect(tx).to.changeEtherBalances([signer1.address, deployer], [parseEther('1'), parseEther('-1')]);
        });

        describe('errors', () => {
          it('should fail when value is send and no referral set', async () => {
            await expect(
              stakingSimple$
                .connect(signer0)
                .deposit(signer0.address, parseEther('1'), parseEther('1'), [], { value: parseEther('1') }),
            ).to.be.revertedWithCustomError(stakingSimple$, 'Staking__ValueNotAllowed');
          });

          it('should fail when referral has wrong address', async () => {
            await expect(
              stakingSimple$
                .connect(signer0)
                .deposit(signer0.address, parseEther('1'), parseEther('1'), [ZeroAddress], { value: parseEther('1') }),
            ).to.be.revertedWithCustomError(stakingSimple$, 'Staking__AddressZero');
          });
        });
      });

      describe('with errors', () => {
        it('should not deposit when staker not set', async () => {
          await expect(
            stakingSimple$.connect(signer0).deposit(ZeroAddress, parseEther('1'), parseEther('1'), []),
          ).to.be.revertedWithCustomError(stakingSimple$, 'Staking__AddressZero');
        });

        it('should not deposit when amount 0', async () => {
          await expect(
            stakingSimple$.connect(signer0).deposit(signer0.address, 0, parseEther('1'), []),
          ).to.be.revertedWithCustomError(stakingSimple$, 'Staking__AmountZero');
        });

        it('should not deposit when insufficent min amount', async () => {
          await expect(
            stakingSimple$.connect(signer0).deposit(signer0.address, parseEther('0.5'), parseEther('1'), []),
          ).to.be.revertedWithCustomError(stakingSimple$, 'Staking__AmountReceivedInsufficient');
        });

        it('should not deposit when amount too big', async () => {
          await erc20MockStaking$.mint(signer0.address, MaxUint256 / 2n);
          await expect(
            stakingSimple$.connect(signer0).deposit(signer0.address, MaxUint256 / 2n + 1n, parseEther('1'), []),
          ).to.be.revertedWithCustomError(stakingSimple$, 'Staking__AmountOverflow');
        });

        it('should not restake when no stake or rewards', async () => {
          await expect(stakingSimple$.connect(signer0).restake([])).to.be.revertedWithCustomError(
            stakingSimple$,
            'Staking__InvalidAmount',
          );
        });

        it('should not inject when no stakers', async () => {
          await expect(
            stakingSimple$.connect(signer0).injectRewards(parseEther('1'), parseEther('1'), []),
          ).to.be.revertedWithCustomError(stakingSimple$, 'Staking__NoStakes');
        });

        describe('after deposit', () => {
          beforeEach(async () => {
            await stakingSimple$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
            await stakingSimple$.connect(signer1).deposit(signer1.address, parseEther('2'), parseEther('2'), []);
          });

          it('should not withdraw when receiver not set', async () => {
            await expect(
              stakingSimple$.connect(signer0).withdraw(ZeroAddress, parseEther('1'), []),
            ).to.be.revertedWithCustomError(stakingSimple$, 'Staking__AddressZero');
          });

          it('should not withdraw when amount 0', async () => {
            await expect(
              stakingSimple$.connect(signer0).withdraw(signer0.address, 0, []),
            ).to.be.revertedWithCustomError(stakingSimple$, 'Staking__AmountZero');
          });

          it('should not withdraw when given amount is greater than extisting', async () => {
            await expect(
              stakingSimple$.connect(signer0).withdraw(signer0.address, parseEther('100'), []),
            ).to.be.revertedWithCustomError(stakingSimple$, 'Staking__AmountOverflow');
          });

          it('should not inject when amount 0', async () => {
            await expect(stakingSimple$.connect(signer0).injectRewards(0, 0, [])).to.be.revertedWithCustomError(
              stakingSimple$,
              'Staking__AmountZero',
            );
          });

          it('should not claim when receiver not set', async () => {
            await stakingSimple$.connect(signer0).injectRewards(parseEther('1'), parseEther('1'), []);
            await expect(stakingSimple$.connect(signer0).claimRewards(ZeroAddress, [])).to.be.revertedWithCustomError(
              stakingSimple$,
              'Staking__AddressZero',
            );
          });

          it('should return stakers', async () => {
            expect(await stakingSimple$.getStakersCount()).to.eq(2);
            {
              const { _stakers, _count } = await stakingSimple$.getStakers(1, 0);
              expect(_stakers.length).to.eq(1);
              expect(_count).to.eq(2);
            }

            {
              const { _stakers } = await stakingSimple$.getStakers(1, 1);
              expect(_stakers.length).to.eq(1);
            }

            {
              const { _stakers } = await stakingSimple$.getStakers(1, 2);
              expect(_stakers.length).to.eq(0);
            }

            {
              const { _stakers } = await stakingSimple$.getStakers(10, 0);
              expect(_stakers.length).to.eq(2);
            }

            {
              const { _stakers } = await stakingSimple$.getStakers(10, 10);
              expect(_stakers.length).to.eq(0);
            }
          });
        });
      });
    });
  });
});
