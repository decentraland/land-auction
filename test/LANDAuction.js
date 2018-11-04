import { assertRevert } from 'openzeppelin-eth/test/helpers/assertRevert'
import { increaseTime, duration } from './helpers/increaseTime'

const BigNumber = web3.BigNumber
require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

const LANDAuction = artifacts.require('LANDAuction')
const ERC20Token = artifacts.require('ERC20Test')
const AssetRegistryToken = artifacts.require('AssetRegistryTest')

const AUCTION_STATUS_OP_CODES = {
  created: 0,
  started: 1,
  finished: 2
}

function getBlockchainTime(blockNumber = 'latest') {
  return web3.eth.getBlock(blockNumber).timestamp
}

function parseFloatWithDecimal(num, decimals = 2) {
  return parseFloat(parseFloat(num).toFixed(decimals))
}

function weiToDecimal(num) {
  return parseFloatWithDecimal(web3.fromWei(num))
}

function normalizeEvent(log) {
  const newArgs = {}
  const { args } = log
  for (let key in args) {
    newArgs[key] = args[key]
    // _price, _totalPrice and _total to wei & two decimals due different round method between languages
    if (key === '_price' || key === '_totalPrice' || key === '_total') {
      newArgs[key] = weiToDecimal(args[key]).toString()
    }
  }
  return {
    ...log,
    args: newArgs
  }
}

function assertEvent(log, expectedEventName, expectedArgs) {
  const { event, args } = log
  event.should.be.eq(expectedEventName)

  if (expectedArgs) {
    for (let key in expectedArgs) {
      let value = args[key]
      if (key === '_xs' || key === '_ys') {
        for (let i = 0; i < value.length; i++) {
          value[i]
            .toString()
            .should.be.equal(
              expectedArgs[key][i].toString(),
              `[assertEvent] ${key}`
            )
        }
      } else {
        if (value instanceof BigNumber) {
          value = value.toString()
        }

        value.should.be.equal(expectedArgs[key], `[assertEvent] ${key}`)
      }
    }
  }
}

async function getEvents(contract, eventName) {
  return new Promise((resolve, reject) => {
    contract[eventName]().get(function(err, logs) {
      if (err) reject(new Error(`Error fetching the ${eventName} events`))
      resolve(logs)
    })
  })
}

contract('LANDAuction', function([
  _,
  owner,
  bidder,
  anotherBidder,
  bidderWithoutFunds,
  hacker
]) {
  const initialPrice = web3.toWei(0.5, 'ether')
  const endPrice = web3.toWei(0.1, 'ether')
  const auctionDuration = duration.days(15)
  const zeroAddress = '0x0000000000000000000000000000000000000000'
  const landsLimitPerBid = 20
  const gasPriceLimit = 4
  const xs = [1, 2, 3, 4]
  const ys = [1, 2, 3, 4]

  let initialTime

  let landAuction
  let manaToken
  let landRegistry

  const fromOwner = {
    from: owner
  }

  const fromBidder = {
    from: bidder
  }

  const fromAnotherBidder = {
    from: anotherBidder
  }

  const fromBidderWithoutFunds = {
    from: bidderWithoutFunds
  }

  const fromHacker = {
    from: hacker
  }

  const creationParams = {
    ...fromOwner,
    gas: 6e6,
    gasPrice: 21e9
  }

  const getPriceWithLinearFunction = time => {
    let price =
      initialPrice - ((initialPrice - endPrice) * time) / auctionDuration
    if (time < 0) {
      price = initialPrice
    } else if (time > auctionDuration) {
      price = endPrice
    }
    return weiToDecimal(price)
  }

  const getCurrentPrice = async () => {
    const price = await landAuction.getCurrentPrice()
    return weiToDecimal(price.toNumber())
  }

  beforeEach(async function() {
    // Create tokens
    manaToken = await ERC20Token.new(creationParams)
    landRegistry = await AssetRegistryToken.new(creationParams)

    // Create a LANDAuction
    landAuction = await LANDAuction.new(
      initialPrice,
      endPrice,
      auctionDuration,
      manaToken.address,
      landRegistry.address,
      fromOwner
    )

    // Start auction
    await landAuction.startAuction(landsLimitPerBid, gasPriceLimit, fromOwner)
    initialTime = getBlockchainTime()

    // Assign balance to bidders and allow LANDAuction to move MANA
    await manaToken.setBalance(web3.toWei(10, 'ether'), fromBidder)
    await manaToken.setBalance(web3.toWei(10, 'ether'), fromAnotherBidder)
    await manaToken.approve(
      landAuction.address,
      web3.toWei(10, 'ether'),
      fromBidder
    )
    await manaToken.approve(
      landAuction.address,
      web3.toWei(10, 'ether'),
      fromAnotherBidder
    )
  })

  describe('constructor', function() {
    it('should instanciate with correct values', async function() {
      const _landAuction = await LANDAuction.new(
        initialPrice,
        endPrice,
        auctionDuration,
        manaToken.address,
        landRegistry.address,
        fromOwner
      )

      const logs = await getEvents(_landAuction, 'AuctionCreated')
      logs.length.should.be.equal(1)
      assertEvent(logs[0], 'AuctionCreated', {
        _caller: owner,
        _initialPrice: initialPrice.toString(),
        _endPrice: endPrice.toString(),
        _duration: auctionDuration.toString()
      })

      const currentLANDPrice = await _landAuction.getCurrentPrice()
      currentLANDPrice.should.be.bignumber.equal(initialPrice)

      const status = await _landAuction.status()
      status.should.be.bignumber.equal(AUCTION_STATUS_OP_CODES.created)
    })

    it('revert if instanciate with incorrect values :: initialPrice = 0', async function() {
      await assertRevert(
        LANDAuction.new(
          0,
          0,
          auctionDuration,
          manaToken.address,
          landRegistry.address,
          fromOwner
        )
      )
    })

    it('revert if instanciate with incorrect values :: initialPrice < endPrice', async function() {
      await assertRevert(
        LANDAuction.new(
          endPrice - 1,
          endPrice,
          auctionDuration,
          manaToken.address,
          landRegistry.address,
          fromOwner
        )
      )
    })

    it('revert if instanciate with incorrect values :: duration < 1 day', async function() {
      await assertRevert(
        LANDAuction.new(
          initialPrice,
          endPrice,
          duration.days(1),
          manaToken.address,
          landRegistry.address,
          fromOwner
        )
      )
    })

    it('revert if instanciate with incorrect values :: manaToken not a valid address', async function() {
      await assertRevert(
        LANDAuction.new(
          initialPrice,
          endPrice,
          auctionDuration,
          zeroAddress,
          landRegistry.address,
          fromOwner
        )
      )

      await assertRevert(
        LANDAuction.new(
          initialPrice,
          endPrice,
          auctionDuration,
          0,
          landRegistry.address,
          fromOwner
        )
      )
    })

    it('revert if instanciate with incorrect values :: manaToken not a contract address', async function() {
      await assertRevert(
        LANDAuction.new(
          endPrice - 1,
          endPrice,
          auctionDuration,
          owner,
          landRegistry.address,
          fromOwner
        )
      )
    })

    it('revert if instanciate with incorrect values :: landRegistry not a valid address', async function() {
      await assertRevert(
        LANDAuction.new(
          initialPrice,
          endPrice,
          auctionDuration,
          manaToken.address,
          zeroAddress,
          fromOwner
        )
      )

      await assertRevert(
        LANDAuction.new(
          initialPrice,
          endPrice,
          auctionDuration,
          manaToken.address,
          0,
          fromOwner
        )
      )
    })

    it('revert if instanciate with incorrect values :: landRegistry not a contract address', async function() {
      await assertRevert(
        LANDAuction.new(
          endPrice - 1,
          endPrice,
          auctionDuration,
          manaToken.address,
          owner,
          fromOwner
        )
      )
    })
  })

  describe('startAuction', function() {
    let _landAuction
    beforeEach(async function() {
      _landAuction = await LANDAuction.new(
        initialPrice,
        endPrice,
        auctionDuration,
        manaToken.address,
        landRegistry.address,
        fromOwner
      )
    })

    it('should start auction', async function() {
      const { logs } = await _landAuction.startAuction(
        landsLimitPerBid,
        gasPriceLimit,
        fromOwner
      )

      logs.length.should.be.equal(3)

      assertEvent(logs[0], 'LandsLimitPerBidChanged', {
        _oldLandsLimitPerBid: '0',
        _landsLimitPerBid: landsLimitPerBid.toString()
      })

      assertEvent(logs[1], 'GasPriceLimitChanged', {
        _oldGasPriceLimit: '0',
        _gasPriceLimit: gasPriceLimit.toString()
      })

      assertEvent(logs[2], 'AuctionStarted', {
        _caller: owner,
        _time: getBlockchainTime().toString()
      })

      const status = await _landAuction.status()
      const _landLimit = await _landAuction.landsLimitPerBid()
      const _gasPriceLimit = await _landAuction.gasPriceLimit()

      status.should.be.bignumber.equal(AUCTION_STATUS_OP_CODES.started)
      _landLimit.should.be.bignumber.equal(landsLimitPerBid)
      _gasPriceLimit.should.be.bignumber.equal(gasPriceLimit)
    })

    it('reverts when trying to re-start auction', async function() {
      await _landAuction.startAuction(
        landsLimitPerBid,
        gasPriceLimit,
        fromOwner
      )
      await assertRevert(
        _landAuction.startAuction(landsLimitPerBid, gasPriceLimit, fromOwner)
      )
    })

    it('reverts when no-owner trying to start auction', async function() {
      await assertRevert(
        _landAuction.startAuction(landsLimitPerBid, gasPriceLimit, fromHacker)
      )
    })

    it('reverts when landLimit = 0', async function() {
      await assertRevert(
        _landAuction.startAuction(0, gasPriceLimit, fromHacker)
      )
    })

    it('reverts when gasPriceLimit = 0', async function() {
      await assertRevert(
        _landAuction.startAuction(landsLimitPerBid, 0, fromHacker)
      )
    })
  })

  describe('setLandsLimitPerBid', function() {
    it('should change lands limit', async function() {
      let _landLimit = await landAuction.landsLimitPerBid()
      _landLimit.should.be.bignumber.equal(landsLimitPerBid)

      await landAuction.setLandsLimitPerBid(40, fromOwner)

      _landLimit = await landAuction.landsLimitPerBid()
      _landLimit.should.be.bignumber.equal(40)
    })

    it('revert when changing to 0', async function() {
      await assertRevert(landAuction.setLandsLimitPerBid(0, fromOwner))
    })

    it('revert when no-owner try to change it', async function() {
      await assertRevert(
        landAuction.setLandsLimitPerBid(landsLimitPerBid, fromHacker)
      )
    })
  })

  describe('setGasPriceLimit', function() {
    it('should change gas price limit', async function() {
      let _gasPriceLimit = await landAuction.gasPriceLimit()
      _gasPriceLimit.should.be.bignumber.equal(gasPriceLimit)

      await landAuction.setGasPriceLimit(8, fromOwner)

      _gasPriceLimit = await landAuction.gasPriceLimit()
      _gasPriceLimit.should.be.bignumber.equal(8)
    })

    it('revert when changing to 0', async function() {
      await assertRevert(landAuction.setGasPriceLimit(0, fromOwner))
    })

    it('revert when no-owner try to change it', async function() {
      await assertRevert(
        landAuction.setGasPriceLimit(gasPriceLimit, fromHacker)
      )
    })
  })

  describe('pause', function() {
    it('should pause', async function() {
      const { logs } = await landAuction.pause(fromOwner)
      const time = getBlockchainTime()

      logs.length.should.be.equal(2)

      assertEvent(logs[0], 'Paused')
      assertEvent(normalizeEvent(logs[1]), 'AuctionEnd', {
        _caller: owner,
        _price: getPriceWithLinearFunction(time - initialTime).toString()
      })

      const status = await landAuction.status()
      status.should.be.bignumber.equal(AUCTION_STATUS_OP_CODES.finished)
    })

    it('reverts when trying to re-pause', async function() {
      await landAuction.pause(fromOwner)
      await assertRevert(landAuction.pause(fromOwner))
    })

    it('reverts when no-owner trying to pause', async function() {
      await assertRevert(landAuction.pause(fromHacker))
    })
  })

  describe('finishAuction', function() {
    it('should finish auction', async function() {
      const { logs } = await landAuction.finishAuction(fromOwner)
      const time = getBlockchainTime()

      logs.length.should.be.equal(2)

      assertEvent(logs[0], 'Paused')
      assertEvent(normalizeEvent(logs[1]), 'AuctionEnd', {
        _caller: owner,
        _price: getPriceWithLinearFunction(time - initialTime).toString()
      })

      const status = await landAuction.status()
      status.should.be.bignumber.equal(AUCTION_STATUS_OP_CODES.finished)
    })

    it('reverts when trying to re-finish auction', async function() {
      await landAuction.finishAuction(fromOwner)
      await assertRevert(landAuction.finishAuction(fromOwner))
    })

    it('reverts when no-owner trying to finish auction', async function() {
      await assertRevert(landAuction.finishAuction(fromHacker))
    })
  })

  describe('getCurrentPrice', function() {
    it('should get current price', async function() {
      // Day 0
      let oldPrice = await getCurrentPrice()
      let price = oldPrice
      let time = getBlockchainTime()
      price.should.be.equal(getPriceWithLinearFunction(time - initialTime))

      // Day 5
      await increaseTime(duration.days(5))
      price = await getCurrentPrice()
      time = getBlockchainTime()
      price.should.be.lt(oldPrice)
      price.should.be.equal(getPriceWithLinearFunction(time - initialTime))
      oldPrice = price

      // Day 14
      await increaseTime(duration.days(9))
      price = await getCurrentPrice()
      time = getBlockchainTime()
      price.should.be.lt(oldPrice)
      price.should.be.equal(getPriceWithLinearFunction(time - initialTime))
      oldPrice = price

      // Day 14 and 10 hours
      await increaseTime(duration.hours(10))
      price = await getCurrentPrice()
      time = getBlockchainTime()
      price.should.be.lt(oldPrice)
      price.should.be.equal(getPriceWithLinearFunction(time - initialTime))
    })

    it('should get end price when auction time finished', async function() {
      await increaseTime(auctionDuration)
      let price = await landAuction.getCurrentPrice()

      price.should.be.bignumber.equal(endPrice)

      await increaseTime(duration.days(1))
      price = await landAuction.getCurrentPrice()

      price.should.be.bignumber.equal(endPrice)
    })
  })

  describe('bid', function() {
    it('should bid', async function() {
      const { logs } = await landAuction.bid(xs, ys, bidder, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })

      const time = getBlockchainTime(logs[0].blockNumber)
      const price = getPriceWithLinearFunction(time - initialTime)

      logs.length.should.be.equal(1)

      assertEvent(
        normalizeEvent(logs[0]),
        'BidSuccessful',
        {
          _beneficiary: bidder,
          _price: price.toString(),
          _totalPrice: (price * xs.length).toString(),
          _xs: xs,
          _ys: ys
        },
        true
      )

      for (let i = 0; i < xs.length; i++) {
        const id = await landRegistry._encodeTokenId(xs[i], ys[i])
        const address = await landRegistry.ownerOf(id)
        address.should.be.equal(bidder)
      }

      const balance = await manaToken.balanceOf(landAuction.address)
      balance.should.be.bignumber.equal(logs[0].args._totalPrice)
    })

    it('should increase balance of LANDAuction contract', async function() {
      let total = 0
      const logs1 = await landAuction.bid(xs, ys, bidder, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })
      let log = logs1.logs[0]
      total = log.args._totalPrice.plus(total)

      await increaseTime(duration.hours(5))
      const logs2 = await landAuction.bid([5], [5], anotherBidder, {
        ...fromAnotherBidder,
        gasPrice: gasPriceLimit
      })
      log = logs2.logs[0]
      total = log.args._totalPrice.plus(total)

      await increaseTime(duration.days(3))
      const log3 = await landAuction.bid([6], [6], bidder, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })
      log = log3.logs[0]
      total = log.args._totalPrice.plus(total)

      const balance = await manaToken.balanceOf(landAuction.address)
      balance.should.be.bignumber.equal(total)

      let id = await landRegistry._encodeTokenId(5, 5)
      let address = await landRegistry.ownerOf(id)
      address.should.be.equal(anotherBidder)

      id = await landRegistry._encodeTokenId(6, 6)
      address = await landRegistry.ownerOf(id)
      address.should.be.equal(bidder)

      for (let i = 0; i < xs.length; i++) {
        id = await landRegistry._encodeTokenId(xs[i], ys[i])
        address = await landRegistry.ownerOf(id)
        address.should.be.equal(bidder)
      }
    })

    it('should assign LANDs to beneficiary', async function() {
      await landAuction.bid(xs, ys, anotherBidder, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })

      for (let i = 0; i < xs.length; i++) {
        const id = await landRegistry._encodeTokenId(xs[i], ys[i])
        const address = await landRegistry.ownerOf(id)
        address.should.be.equal(anotherBidder)
      }
    })

    it('should bid limit LANDs', async function() {
      await landAuction.bid([-150, 150], [-150, 150], bidder, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })
    })

    it('reverts if try to bid assigned LANDs', async function() {
      await landAuction.bid(xs, ys, bidder, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })

      await assertRevert(
        landAuction.bid([1], [1], bidder, {
          ...fromAnotherBidder,
          gasPrice: gasPriceLimit
        })
      )
    })

    it('reverts if bidder has insufficient funds', async function() {
      await assertRevert(
        landAuction.bid(xs, ys, bidder, {
          ...fromBidderWithoutFunds,
          gasPrice: gasPriceLimit
        })
      )
    })

    it('reverts if bidder has not approve MANA', async function() {
      await manaToken.approve(
        landAuction.address,
        web3.toWei(0.1, 'ether'),
        fromBidder
      )

      await assertRevert(
        landAuction.bid(xs, ys, bidder, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )
    })

    it('reverts if auction is finished', async function() {
      await landAuction.finishAuction(fromOwner)
      await assertRevert(
        landAuction.bid(xs, ys, bidder, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )
    })

    it('reverts if bid for empty LAND', async function() {
      await assertRevert(
        landAuction.bid([], [], bidder, {
          ...fromBidder,
          gasPrice: gasPriceLimit + 1
        })
      )
    })

    it('reverts if bid for invalid coordinates', async function() {
      await assertRevert(
        landAuction.bid([1, 2], [3], bidder, {
          ...fromBidder,
          gasPrice: gasPriceLimit + 1
        })
      )
    })

    it('reverts if exceed gas price limit', async function() {
      await assertRevert(
        landAuction.bid(xs, ys, bidder, {
          ...fromBidder,
          gasPrice: gasPriceLimit + 1
        })
      )
    })

    it('reverts if try to bid out of boundaries LANDs', async function() {
      assertRevert(
        landAuction.bid([-151], [150], bidder, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )

      assertRevert(
        landAuction.bid([151], [150], bidder, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )

      assertRevert(
        landAuction.bid([150], [-151], bidder, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )

      assertRevert(
        landAuction.bid([150], [151], bidder, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )
    })

    it('reverts if try to bid when now - initialTime > duration ', async function() {
      await increaseTime(auctionDuration)
      await increaseTime(duration.seconds(1))
      await assertRevert(
        landAuction.bid([1], [1], bidder, {
          ...fromAnotherBidder,
          gasPrice: gasPriceLimit
        })
      )
    })
  })

  describe('burnFunds', function() {
    it('should burnFunds', async function() {
      await increaseTime(duration.days(3))
      await landAuction.bid(xs, ys, bidder, {
        ...fromBidder,
        gasPrice: gasPriceLimit - 1
      })
      const price = await getCurrentPrice()
      await landAuction.finishAuction(fromOwner)
      const { logs } = await landAuction.burnFunds(fromOwner)

      logs.length.should.be.equal(1)

      assertEvent(
        normalizeEvent(logs[0]),
        'MANABurned',
        {
          _caller: owner,
          _total: (price * xs.length).toString()
        },
        true
      )
    })

    it('reverts when trying to burn 0 funds', async function() {
      await landAuction.finishAuction(fromOwner)
      await assertRevert(landAuction.burnFunds(fromOwner))
    })

    it('reverts when trying to burn before finished', async function() {
      await assertRevert(landAuction.burnFunds(fromOwner))
    })
  })
})
