import { expect } from "chai";
import { ethers } from "hardhat";

describe("TokenFarm", function () {
  let DappToken, LPToken, TokenFarm;
  let dappToken, lpToken, tokenFarm;
  let owner, user1, user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy DappToken
    DappToken = await ethers.getContractFactory("DappToken");
    dappToken = await DappToken.deploy();
    await dappToken.waitForDeployment();

    // Deploy LPToken
    LPToken = await ethers.getContractFactory("LPToken");
    lpToken = await LPToken.deploy();
    await lpToken.waitForDeployment();

    // Deploy TokenFarm
    TokenFarm = await ethers.getContractFactory("TokenFarm");
    tokenFarm = await TokenFarm.deploy(await dappToken.getAddress(), await lpToken.getAddress());
    await tokenFarm.waitForDeployment();

    // Transfer ownership of DappToken to TokenFarm for minting
    await dappToken.transferOwnership(await tokenFarm.getAddress());

    // Transfer some LP tokens to user1 for staking
    await lpToken.transfer(user1.address, ethers.parseEther("1000"));
  });

  describe("Deployment", function () {
    it("Should set the correct token addresses", async function () {
      expect(await tokenFarm.dappToken()).to.equal(await dappToken.getAddress());
      expect(await tokenFarm.lpToken()).to.equal(await lpToken.getAddress());
    });

    it("Should initialize totalStaked to 0", async function () {
      expect(await tokenFarm.totalStaked()).to.equal(0);
    });
  });

  describe("Staking", function () {
    const stakeAmount = ethers.parseEther("100");

    beforeEach(async function () {
      await lpToken.connect(user1).approve(await tokenFarm.getAddress(), stakeAmount);
    });

    it("Should allow users to stake LP tokens", async function () {
      await expect(tokenFarm.connect(user1).stake(stakeAmount))
        .to.emit(tokenFarm, "Staked")
        .withArgs(user1.address, stakeAmount);

      expect(await tokenFarm.stakedBalance(user1.address)).to.equal(stakeAmount);
      expect(await tokenFarm.totalStaked()).to.equal(stakeAmount);
    });

    it("Should not allow staking 0 tokens", async function () {
      await expect(tokenFarm.connect(user1).stake(0))
        .to.be.revertedWith("Cannot stake 0");
    });
  });

  describe("Rewards", function () {
    const stakeAmount = ethers.parseEther("100");

    beforeEach(async function () {
      await lpToken.connect(user1).approve(await tokenFarm.getAddress(), stakeAmount);
      await tokenFarm.connect(user1).stake(stakeAmount);
    });

    it("Should calculate rewards correctly over time", async function () {
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine");

      const earned = await tokenFarm.earned(user1.address);
      expect(earned).to.be.gt(0);
    });

    it("Should allow users to claim rewards", async function () {
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine");

      const earnedBefore = await tokenFarm.earned(user1.address);
      expect(earnedBefore).to.be.gt(0);

      await expect(tokenFarm.connect(user1).getReward())
        .to.emit(tokenFarm, "RewardPaid")
        .withArgs(user1.address, earnedBefore);

      const userDappBalance = await dappToken.balanceOf(user1.address);
      expect(userDappBalance).to.equal(earnedBefore);
    });
  });

  describe("Withdrawal", function () {
    const stakeAmount = ethers.parseEther("100");

    beforeEach(async function () {
      await lpToken.connect(user1).approve(await tokenFarm.getAddress(), stakeAmount);
      await tokenFarm.connect(user1).stake(stakeAmount);
    });

    it("Should allow users to withdraw staked tokens", async function () {
      const withdrawAmount = ethers.parseEther("50");
      await expect(tokenFarm.connect(user1).withdraw(withdrawAmount))
        .to.emit(tokenFarm, "Withdrawn")
        .withArgs(user1.address, withdrawAmount);

      expect(await tokenFarm.stakedBalance(user1.address)).to.equal(ethers.parseEther("50"));
      expect(await tokenFarm.totalStaked()).to.equal(ethers.parseEther("50"));
    });

    it("Should not allow withdrawing more than staked", async function () {
      const excessAmount = ethers.parseEther("200");
      await expect(tokenFarm.connect(user1).withdraw(excessAmount))
        .to.be.revertedWith("Insufficient balance");
    });
  });

  describe("Exit", function () {
    const stakeAmount = ethers.parseEther("100");

    beforeEach(async function () {
      await lpToken.connect(user1).approve(await tokenFarm.getAddress(), stakeAmount);
      await tokenFarm.connect(user1).stake(stakeAmount);
      await ethers.provider.send("evm_increaseTime", [1800]);
      await ethers.provider.send("evm_mine");
    });

    it("Should allow users to exit and claim rewards", async function () {
      const earnedBefore = await tokenFarm.earned(user1.address);
      expect(earnedBefore).to.be.gt(0);

      await expect(tokenFarm.connect(user1).exit())
        .to.changeTokenBalance(dappToken, user1, earnedBefore)
        .and.changeTokenBalance(lpToken, user1, stakeAmount);

      expect(await tokenFarm.stakedBalance(user1.address)).to.equal(0);
      expect(await tokenFarm.totalStaked()).to.equal(0);
    });
  });

  describe("Owner Functions", function () {
    it("Should allow owner to set reward rate", async function () {
      const newRate = ethers.parseEther("200");
      await expect(tokenFarm.connect(owner).setRewardRate(newRate))
        .to.emit(tokenFarm, "RewardRateUpdated")
        .withArgs(newRate);

      expect(await tokenFarm.rewardRate()).to.equal(newRate);
    });

    it("Should not allow non-owner to set reward rate", async function () {
      const newRate = ethers.parseEther("200");
      await expect(tokenFarm.connect(user1).setRewardRate(newRate))
        .to.be.revertedWith("Only owner can call this function");
    });

    it("Should allow owner to add rewards", async function () {
      const amount = ethers.parseEther("1000");
      await expect(tokenFarm.connect(owner).addRewards(amount))
        .to.emit(tokenFarm, "RewardsAdded")
        .withArgs(owner.address, amount);
    });
  });
});