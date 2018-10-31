#! /bin/bash

LAND_AUCTION=LANDAuction.sol


OUTPUT=full

npx truffle-flattener contracts/auction/$LAND_AUCTION > $OUTPUT/$LAND_AUCTION
