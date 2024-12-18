import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { AbiCoder, MaxUint256, parseEther, ZeroAddress, ZeroHash } from 'ethers';
import { beforeEach, describe } from 'mocha';
import { ERC20Mock, StakingActionFees } from 'typechain-types';
import { deployStaking, DeployStakingParams } from './../utils/contracts';
import { deployFixtures } from './../utils/fixtures';

describe('Staking: Action Fees', () => {
  let erc20MockStaking$: ERC20Mock;
  let deployer: string, stakingToken: string;
  let createParams: DeployStakingParams;
  let signer0: SignerWithAddress, signer1: SignerWithAddress;

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
      args: new AbiCoder().encode(['uint16', 'uint16', 'uint16'], [100, 200, 300]),
    };
  });

  it('should initialize with fees', async () => {
    await expect(deployStaking<StakingActionFees>('StakingActionFees', { ...createParams, args: ZeroHash })).to.be
      .reverted;
    const staking$ = await deployStaking<StakingActionFees>('StakingActionFees', createParams);
    expect(await staking$.depositFee()).to.eq(100);
    expect(await staking$.withdrawFee()).to.eq(200);
    expect(await staking$.restakeFee()).to.eq(300);
  });

  describe('deployed by factory', () => {
    let staking$: StakingActionFees;
    beforeEach(async () => {
      staking$ = await deployStaking<StakingActionFees>('StakingActionFees', createParams);
      await erc20MockStaking$.mint(signer0.address, parseEther('10'));
      await erc20MockStaking$.mint(signer1.address, parseEther('10'));
      await erc20MockStaking$.approve(await staking$.getAddress(), MaxUint256);
      await erc20MockStaking$.connect(signer0).approve(await staking$.getAddress(), MaxUint256);
      await erc20MockStaking$.connect(signer1).approve(await staking$.getAddress(), MaxUint256);
      await staking$.enable(true, []);
    });

    it('should fail deposit on wrong params', async () => {
      await expect(
        staking$.connect(signer0).deposit(ZeroAddress, parseEther('1'), parseEther('1'), []),
      ).to.be.revertedWithCustomError(staking$, 'StakingActionFees__AddressZero');
      await expect(staking$.connect(signer0).deposit(signer0.address, 0, 0, [])).to.be.revertedWithCustomError(
        staking$,
        'Staking__AmountZero',
      );
    });

    it('should not charge fees on deposit while no stakes', async () => {
      await staking$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
      const { amount } = await staking$.getStakeOf(signer0.address);
      expect(amount).to.eq(parseEther('1'));
    });

    describe('having stakers', () => {
      beforeEach(async () => {
        await staking$.connect(signer0).deposit(signer0.address, parseEther('1'), parseEther('1'), []);
      });

      it('should charge fees on deposit and reward stakers', async () => {
        await staking$.connect(signer1).deposit(signer1.address, parseEther('1'), parseEther('1'), []);
        const { amount } = await staking$.getStakeOf(signer1.address);
        expect(amount).to.eq(parseEther('0.99'));
        expect(await staking$.getPendingRewards(signer0.address)).to.eq(parseEther('0.01'));
        expect(await staking$.getPendingRewards(signer1.address)).to.eq(0);
      });

      it('should charge fees on withdraw', async () => {
        await staking$.connect(signer1).deposit(signer1.address, parseEther('1'), parseEther('1'), []);
        await expect(
          staking$.connect(signer1).withdraw(signer1.address, parseEther('0.99'), []),
        ).to.changeTokenBalances(
          erc20MockStaking$,
          [await staking$.getAddress(), signer1.address],
          [parseEther('-0.9702'), parseEther('0.9702')],
        );
        expect(await staking$.getPendingRewards(signer0.address)).to.eq(parseEther('0.0298'));
      });

      it('should not charge fees on withdraw', async () => {
        await staking$.connect(signer1).deposit(signer1.address, parseEther('1'), parseEther('1'), []);
        await staking$.updateFees(0, 0, 1, []);
        await expect(
          staking$.connect(signer1).withdraw(signer1.address, parseEther('0.99'), []),
        ).to.changeTokenBalances(
          erc20MockStaking$,
          [await staking$.getAddress(), signer1.address],
          [parseEther('-0.99'), parseEther('0.99')],
        );
      });

      it('should charge fees on restake', async () => {
        await staking$.connect(signer1).deposit(signer1.address, parseEther('1'), parseEther('1'), []);

        // before
        // signer0 | stake = 1 | rewards = 0.01
        // signer1 | stake = 0.99 | rewards = 0
        await staking$.injectRewards(parseEther('1'), parseEther('1'), []);
        expect(await staking$.getPendingRewards(signer0.address)).to.eq(parseEther('0.512512562814070351'));
        expect(await staking$.getPendingRewards(signer1.address)).to.eq(parseEther('0.497487437185929647'));

        // before
        // signer0 | stake = 1 | rewards = 0.512512562814070351
        // signer1 | stake = 0.99 | rewards = 0.497487437185929647
        await staking$.connect(signer0).restake([]);
        expect(await staking$.getPendingRewards(signer0.address)).to.eq(parseEther('0.007726320042423171'));
        expect(await staking$.getPendingRewards(signer1.address)).to.eq(parseEther('0.505136494027928586'));

        const { amount } = await staking$.getStakeOf(signer0.address);
        expect(amount).to.eq(parseEther('1.497137185929648241'));
      });

      it('should not charge fees on restake', async () => {
        await staking$.connect(signer1).deposit(signer1.address, parseEther('1'), parseEther('1'), []);
        await staking$.injectRewards(parseEther('1'), parseEther('1'), []);
        await staking$.updateFees(0, 1, 0, []);

        expect(await staking$.getPendingRewards(signer0.address)).to.eq(parseEther('0.512512562814070351'));
        expect(await staking$.getPendingRewards(signer1.address)).to.eq(parseEther('0.497487437185929647'));

        await staking$.connect(signer0).restake([]);

        expect(await staking$.getPendingRewards(signer0.address)).to.eq(parseEther('0'));
        expect(await staking$.getPendingRewards(signer1.address)).to.eq(parseEther('0.497487437185929647'));

        const { amount } = await staking$.getStakeOf(signer0.address);
        expect(amount).to.eq(parseEther('1.512512562814070351'));

        await expect(staking$.connect(signer0).restake([])).to.be.revertedWithCustomError(
          staking$,
          'StakingActionFees__InvalidAmount',
        );
      });

      it('should not withdraw when receiver is address(0)', async () => {
        await expect(staking$.connect(signer0).withdraw(ZeroAddress, 0, [])).to.be.revertedWithCustomError(
          staking$,
          'StakingActionFees__AddressZero',
        );
      });

      it('should not withdraw when withdraw amount is 0', async () => {
        await expect(staking$.connect(signer0).withdraw(signer0.address, 0, [])).to.be.revertedWithCustomError(
          staking$,
          'StakingActionFees__AmountZero',
        );
      });
    });

    describe('managing fees', () => {
      it('should only be updated by owner', async () => {
        await expect(staking$.connect(signer0).updateFees(250, 250, 250, [])).to.be.reverted;
      });

      it('should update fees', async () => {
        await staking$.updateFees(250, 250, 250, []);
        expect(await staking$.depositFee()).to.eq(250);
        expect(await staking$.restakeFee()).to.eq(250);
        expect(await staking$.withdrawFee()).to.eq(250);
      });

      it('should never be full zero', async () => {
        await staking$.updateFees(0, 0, 1, []);
        expect(await staking$.depositFee()).to.eq(0);
        expect(await staking$.withdrawFee()).to.eq(0);
        expect(await staking$.restakeFee()).to.eq(1);

        await expect(staking$.updateFees(0, 0, 0, [])).to.be.revertedWithCustomError(
          staking$,
          'StakingActionFees__ZeroFee',
        );
      });

      it('should never be > 10%', async () => {
        await expect(staking$.updateFees(0, 0, 1001, [])).to.be.revertedWithCustomError(
          staking$,
          'StakingActionFees__InvalidFee',
        );
        await expect(staking$.updateFees(0, 1001, 0, [])).to.be.revertedWithCustomError(
          staking$,
          'StakingActionFees__InvalidFee',
        );
        await expect(staking$.updateFees(1001, 0, 0, [])).to.be.revertedWithCustomError(
          staking$,
          'StakingActionFees__InvalidFee',
        );
        await expect(staking$.updateFees(1001, 1001, 1001, [])).to.be.revertedWithCustomError(
          staking$,
          'StakingActionFees__InvalidFee',
        );
        await expect(staking$.updateFees(1000, 1000, 1000, []))
          .to.emit(staking$, 'UpdateFees')
          .withArgs(1000, 1000, 1000);

        await staking$.updateFees(0, 1000, 1000, []);
        await staking$.updateFees(1000, 0, 1000, []);
        await staking$.updateFees(1000, 1000, 0, []);
      });
    });
  });
});
