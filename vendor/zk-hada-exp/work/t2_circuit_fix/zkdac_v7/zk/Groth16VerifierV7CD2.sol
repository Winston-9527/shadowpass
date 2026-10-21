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

contract Groth16VerifierV7CD2 {
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
    uint256 constant deltax1 = 16912479305953162639366175441803321224079496960512699852059434937200683955838;
    uint256 constant deltax2 = 5578476858274557973654892232934108003293109710941490838371623364990073997581;
    uint256 constant deltay1 = 5190594815064943643786559386587987932916742147252311861250731428583522017371;
    uint256 constant deltay2 = 15078340228955758560612390235022267860637357034641530739483285201423832481944;

    
    uint256 constant IC0x = 9916221435430635117600304498841291810984297825459463804647589206183726306929;
    uint256 constant IC0y = 143480873663474991640623024052696570831262378586799143134770608694842510811;
    
    uint256 constant IC1x = 2719441137349205783776627253156096297917578663728769254170772897069050552225;
    uint256 constant IC1y = 1617213577186207115389775679953251490270740931778289738556062452747131383994;
    
    uint256 constant IC2x = 5611366039464787066270223260244540211306700743372818124294084799748941437038;
    uint256 constant IC2y = 18736587566251825124509079570000166120847707797182409133425481268915820200442;
    
    uint256 constant IC3x = 18089497272859517742716527386059922090499468288637032337995965461273437346810;
    uint256 constant IC3y = 17068462969181877580079308230621154650257837079665460192390813319996824506288;
    
    uint256 constant IC4x = 16420166410558509900183104554286181056520785781067632020206072143699132025984;
    uint256 constant IC4y = 5277292445708079563129765556171732416562428349145187003292291194793879921001;
    
    uint256 constant IC5x = 16241637892808270915283928828916729352034794488906558160165615323361529204463;
    uint256 constant IC5y = 9283530581375547323522900559646267000919182502859789533729226171399879929069;
    
    uint256 constant IC6x = 16872647561390491914835182754591140889815589424420115469927750747884938579749;
    uint256 constant IC6y = 19519490884088213733498590279304101883558084543105826634480845303650963369193;
    
    uint256 constant IC7x = 9676054940036071245948793515155463246226904700624828041996574444228909874564;
    uint256 constant IC7y = 10889280213031636188768949698186381464316038750720096501534501301312400510560;
    
    uint256 constant IC8x = 1575790427277421978048341919986133641294665849881983827746386325257627620277;
    uint256 constant IC8y = 3900459169480401245122578452735318077731916393098646922684050786123846141765;
    
    uint256 constant IC9x = 2455528076152223046757183926970660554522611139006256899151402284465641486593;
    uint256 constant IC9y = 20281684122641197359259730404755537734479740485371619583859735115464657813906;
    
    uint256 constant IC10x = 14665391158847787530455786470161902067899066737408496961299920990211357973918;
    uint256 constant IC10y = 11443400331059799067173445777265587961043466660737683720800477966731462086855;
    
    uint256 constant IC11x = 5568819915146464421390803895296222799851962821264032729059324522085652241173;
    uint256 constant IC11y = 219536007340553022967326757292292588501514619651936623636655331912839144315;
    
    uint256 constant IC12x = 4159840677990295753371973077188942312401485588508884874308384358341380612633;
    uint256 constant IC12y = 6054740495584465140572467911340090414571621819814843848905675383802392585042;
    
    uint256 constant IC13x = 15559531495200202533975549567532136224175178987560425072548255739979773299993;
    uint256 constant IC13y = 9760871558656646967644226664177706757856559585363436292770154560921761129956;
    
    uint256 constant IC14x = 18930134279944409310306340480226522729395506711010266631066692567099645337339;
    uint256 constant IC14y = 2420477776714323867164146857445116241605226363031249048123261301203988259058;
    
    uint256 constant IC15x = 10806013447331410439887152664815389149511327577017406665462877890482224115061;
    uint256 constant IC15y = 3168043871102772575744788406792684451782218291110725156676815230549503757656;
    
    uint256 constant IC16x = 11840717610352888841800068723423331220967291533390687902393352630752540114694;
    uint256 constant IC16y = 5860334204327994998775318505462230292746693970180156015631895486415223710043;
    
    uint256 constant IC17x = 20661612142379400798692580990142510019187584542370343025567201607345546323718;
    uint256 constant IC17y = 4848731084845817418934005993488985005994052761102260700216444622881683071495;
    
    uint256 constant IC18x = 8087032489766799668400727689623860732247585127271437056794272201696830208292;
    uint256 constant IC18y = 14506764981416381076151931001928416913901174824178970755560478458513393256921;
    
    uint256 constant IC19x = 422616436348747425513723667187675473628605820322038979348830549620459608118;
    uint256 constant IC19y = 10229733811197587243958019021976214569610449168216152945928810954469790620527;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[19] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                

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
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
