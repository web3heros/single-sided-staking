import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { parseEther, ZeroAddress, ZeroHash } from 'ethers';
import { beforeEach, describe } from 'mocha';
import { deployFixtures, getStakingFactoryFor } from '../utils/fixtures';
import { ERC20Mock, IStakingFactory, StakingFactory } from './../typechain-types';
import { templates } from './../utils/contracts';

describe('Staking Factory', () => {
  let erc20MockStaking$: ERC20Mock;
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
  });

  it('should deploy successfully', async () => {
    for (const templateContractName of templates) {
      const factory = await getStakingFactoryFor(templateContractName);
      expect(await factory.getAddress()).to.be.not.empty;
    }
  });

  describe('Create', () => {
    it('should create a staking protocol', async () => {
      const createParams: IStakingFactory.StakingCreateParamsStruct = {
        stakingToken,
        deployer: signer0.address,
        owner: signer1.address,
        args: ZeroHash,
      };
      const factory = await getStakingFactoryFor('StakingSimple');

      const txHappy1 = factory.createStaking(createParams, { value: 0 });
      await expect(txHappy1, 'happy path')
        .to.emit(factory, 'Created')
        .withArgs(signer0.address, signer1.address, anyValue, 0);
      await expect(txHappy1, 'happy path no costs').has.changeEtherBalances([deployer, signer0.address], [0, 0]);

      const txHappy2 = factory.createStaking(createParams, { value: parseEther('1') });
      await expect(txHappy2, 'happy path')
        .to.emit(factory, 'Created')
        .withArgs(signer0.address, signer1.address, anyValue, parseEther('1'));
      await expect(txHappy2, 'happy path with costs').has.changeEtherBalances(
        [deployer, signer0.address],
        [parseEther('-1'), parseEther('1')],
      );

      await expect(
        factory.createStaking({ ...createParams, deployer: ZeroAddress }, { value: 0 }),
        'deployer not given',
      ).to.be.revertedWithCustomError(factory, 'StakingFactory__AddressZero');

      await expect(
        factory.createStaking({ ...createParams, stakingToken: ZeroAddress }, { value: 0 }),
        'staking token not given',
      ).to.be.reverted;

      await expect(factory.createStaking({ ...createParams, owner: ZeroAddress }, { value: 0 }), 'owner not given').to
        .be.reverted;
    });
  });

  describe('Protocols', () => {
    let factory: StakingFactory;
    beforeEach(async () => {
      factory = await getStakingFactoryFor('StakingSimple');

      // 10 protocols by signer0
      for (const _ of new Array(10))
        await factory.createStaking(
          { stakingToken, owner: signer0.address, deployer: signer0.address, args: ZeroHash },
          { value: 0 },
        );

      // 15 protocols by signer1
      for (const _ of new Array(15))
        await factory.createStaking(
          { stakingToken, owner: signer0.address, deployer: signer1.address, args: ZeroHash },
          { value: 0 },
        );
    });

    it('should have multiple protocols', async () => {
      expect(await factory.getProtocolsCount()).to.eq(25);
    });

    it('should have multiple protocols for a specific deployer', async () => {
      expect(await factory.getProtocolsForDeployerCount(signer0.address)).to.eq(10);
      expect(await factory.getProtocolsForDeployerCount(signer1.address)).to.eq(15);
    });

    it('should scroll through all protocols', async () => {
      const page1 = await factory.getProtocols(10, 0);
      expect(page1._response, 'page 1 response').to.have.lengthOf(10);
      expect(page1._count, 'page 1 count').to.eq(25);

      const page2 = await factory.getProtocols(10, 10);
      expect(page2._response, 'page 2 response').to.have.lengthOf(10);
      expect(page2._count, 'page 2 count').to.eq(25);

      const page3 = await factory.getProtocols(10, 20);
      expect(page3._response, 'page 3 response').to.have.lengthOf(5);
      expect(page3._count, 'page 3 count').to.eq(25);

      const page4 = await factory.getProtocols(10, 30);
      expect(page4._response, 'page 4 response').to.have.lengthOf(0);
      expect(page4._count, 'page 4 count').to.eq(25);
    });

    it('should scroll through all protocols of a specific deployer', async () => {
      const page1 = await factory.getProtocolsForDeployer(signer1.address, 10, 0);
      expect(page1._response, 'page 1 response of deployer').to.have.lengthOf(10);
      expect(page1._count, 'page 1 count of deployer').to.eq(15);

      const page2 = await factory.getProtocolsForDeployer(signer1.address, 10, 10);
      expect(page2._response, 'page 2 response of deployer').to.have.lengthOf(5);
      expect(page2._count, 'page 2 count of deployer').to.eq(15);

      const page3 = await factory.getProtocolsForDeployer(signer1.address, 10, 20);
      expect(page3._response, 'page 3 response of deployer').to.have.lengthOf(0);
      expect(page3._count, 'page 3 count of deployer').to.eq(15);
    });
  });
});
