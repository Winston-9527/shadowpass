// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ZkDacGate} from "../src/ZkDacGate.sol";

/// Business target: records the authorized action; can be told to fail (rollback test) or to re-enter the gate.
contract MockTarget {
    uint256 public calls; uint256 public lastAmount; bool public fail;
    bytes public reenterData; bytes public reenterResult; bool public reenterOk;
    function setFail(bool f) external { fail = f; }
    function setReenter(bytes calldata d) external { reenterData = d; }
    function onAuthorized(bytes4, uint256 amount, bytes calldata) external {
        require(!fail, "business failure");
        calls++; lastAmount = amount;
        if (reenterData.length > 0) {
            bytes memory d = reenterData; delete reenterData;
            (reenterOk, reenterResult) = msg.sender.call(d);   // try to replay the same proof from inside the callback
        }
    }
}
