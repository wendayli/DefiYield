// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenFarm is ReentrancyGuard, Ownable {
    IERC20 public dappToken;
    IERC20 public lpToken;

    uint256 public totalStaked;
    uint256 public rewardRate = 1e18;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);

    struct UserStake {
        uint256 stakedBalance;
        uint256 rewardPerTokenPaid;
        uint256 rewards;
        bool hasStaked;
        bool isStaking;
    }

    mapping(address => UserStake) public userStakeInfo;

    constructor(address _dappToken, address _lpToken) Ownable(msg.sender) {
        dappToken = IERC20(_dappToken);
        lpToken = IERC20(_lpToken);
        lastUpdateTime = block.timestamp;
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        return rewardPerTokenStored + (
            (block.timestamp - lastUpdateTime) * rewardRate * 1e18 / totalStaked
        );
    }

    function earned(address account) public view returns (uint256) {
        UserStake storage user = userStakeInfo[account];
        return (
            (user.stakedBalance * (rewardPerToken() - user.rewardPerTokenPaid)) / 1e18
        ) + user.rewards;
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp;
        if (account != address(0)) {
            UserStake storage user = userStakeInfo[account];
            user.rewards = earned(account);
            user.rewardPerTokenPaid = rewardPerTokenStored;
            if (user.rewards > 0) user.hasStaked = true;
            if (user.stakedBalance > 0) user.isStaking = true;
            else user.isStaking = false;
        }
        _;
    }

    modifier onlyStaking() {
        require(userStakeInfo[msg.sender].isStaking, "No estas stakeando");
        _;
    }

    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        UserStake storage user = userStakeInfo[msg.sender];
        totalStaked += amount;
        user.stakedBalance += amount;
        require(lpToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) public nonReentrant updateReward(msg.sender) onlyStaking {
        require(amount > 0, "Cannot withdraw 0");
        UserStake storage user = userStakeInfo[msg.sender];
        require(user.stakedBalance >= amount, "Insufficient balance");
        totalStaked -= amount;
        user.stakedBalance -= amount;
        require(lpToken.transfer(msg.sender, amount), "Transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    function getReward() public nonReentrant updateReward(msg.sender) onlyStaking {
        UserStake storage user = userStakeInfo[msg.sender];
        uint256 reward = user.rewards;
        if (reward > 0) {
            user.rewards = 0;
            require(dappToken.transfer(msg.sender, reward), "Transfer failed");
            emit RewardPaid(msg.sender, reward);
        }
    }

    function exit() external {
        withdraw(userStakeInfo[msg.sender].stakedBalance);
        getReward();
    }

    // ... resto del contrato (setRewardRate, addRewards, etc.)
}