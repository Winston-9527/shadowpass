// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16VerifierV92CD1 {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 20491192805390485299153009773594534940189261866228447918068658471970481763042;
    uint256 constant alphay  = 9383485363053290200918347156157836566562967994039712273449902621266178545958;
    uint256 constant betax1  = 4252822878758300859123897981450591353533073413197771768651442665752259397132;
    uint256 constant betax2  = 6375614351688725206403948262868962793625744043794305715222011528459656738731;
    uint256 constant betay1  = 21847035105528745403288232691147584728191162732299865338377159692350059136679;
    uint256 constant betay2  = 10505242626370262277552901082094356697409835680220590971873171140371331206856;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 15100036868436679647377981652366907968982822802227150567298219205546524524610;
    uint256 constant deltax2 = 8319534294357989880722952054495386164176511657622495777246849258819377476422;
    uint256 constant deltay1 = 6673774404135875119157718261761339209431964702078255976307440713514174364416;
    uint256 constant deltay2 = 15568299212552406109263730532754862739318552601313502348725772707055740638349;

    
    uint256 constant IC0x = 19146771241256856398036772171056270147157243564445860403153494623521239540321;
    uint256 constant IC0y = 17340103815320204284394222424879194598900043348905243407284588145225144646625;
    
    uint256 constant IC1x = 16729576627723310526719919320671101985015576732729105080788931351729710173842;
    uint256 constant IC1y = 16533180256994794468652859777511680184373111490205337668164263669449380904603;
    
    uint256 constant IC2x = 16375089864229212240746192479705487639689447829759288099404934657801886010921;
    uint256 constant IC2y = 162036987668835641578325485640211113991528217743761563001734578240287889261;
    
    uint256 constant IC3x = 18824236850166964487112275544596738949801706939172798854075986024255139651136;
    uint256 constant IC3y = 6452417722135092336156983265601389321674205596856486543826726173523415471889;
    
    uint256 constant IC4x = 8618446651686186941686202536523108718186039745576357584075582860131784864308;
    uint256 constant IC4y = 17684997437182329630804907689576823363747840083684341121906901509911641422149;
    
    uint256 constant IC5x = 1246694491938223379330886103996297064300360763526361793983700329536316989526;
    uint256 constant IC5y = 2803387391779370442075058081224487505367306856222049978076415855962357648369;
    
    uint256 constant IC6x = 9032697986580332216623076050036140075786623202736146240693406359609569731953;
    uint256 constant IC6y = 2951471346250794278013173388046108062936760155762858816210539210659171219565;
    
    uint256 constant IC7x = 2688700077042458215580246707453232746016850573412507223633553354429432537979;
    uint256 constant IC7y = 11322912500745613459222376407549461863848385576582352584210687343792540292185;
    
    uint256 constant IC8x = 12994914142783309670101037110878496106169169101422124351142929761787941971962;
    uint256 constant IC8y = 17902604702257566660136805004729219889748498195268682540980649666812008193620;
    
    uint256 constant IC9x = 4249186964137305187932427830368210598188971073939450415495074650304319102555;
    uint256 constant IC9y = 3538301482789743660830042203660357917665517682217592552446954315373062364384;
    
    uint256 constant IC10x = 7686855179863792871581478466019689066836003181732174213454465067258437806512;
    uint256 constant IC10y = 13704988802080803641271366961368496059168001788998802714772698976234952687398;
    
    uint256 constant IC11x = 5168406962149543942935932386307582040194367813939923619870956662341375809483;
    uint256 constant IC11y = 12760715677591468424567210875631847290268205909190610477610886293476871046284;
    
    uint256 constant IC12x = 5361473803094451594528466826947994122239129466329104832878768357746755038171;
    uint256 constant IC12y = 20087582092425272844738425077310013897692559713536732244225422489080619438891;
    
    uint256 constant IC13x = 8322164142061454843761180801911055733790482423244840297070716786500202429599;
    uint256 constant IC13y = 5268666758556939879408455455145922991334637431484327348720925789896000377692;
    
    uint256 constant IC14x = 8273389472997945319978339440839926144423884119934843539753384182876162575929;
    uint256 constant IC14y = 12104853112218321350388255163955951253408245240252191640603173087553271731404;
    
    uint256 constant IC15x = 21695816935066896381969680666996106620580076835165264746912106329068034642101;
    uint256 constant IC15y = 8313560145160084722533135756188995067121822962211254382561828088311395857583;
    
    uint256 constant IC16x = 21473852274659247532879998722885991253079008363976855567498347097589421100528;
    uint256 constant IC16y = 7122691469633043445339424939218541889797198090582664936438604857037696641105;
    
    uint256 constant IC17x = 9097817138043142069476916998073265846968594090357592968337331001481071723869;
    uint256 constant IC17y = 1681473027350896293314835229245890355189266239034814577813655955610270472544;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[17] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            
            checkField(calldataload(add(_pubSignals, 448)))
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
