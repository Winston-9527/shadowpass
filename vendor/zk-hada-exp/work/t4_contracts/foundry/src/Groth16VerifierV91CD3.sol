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

contract Groth16VerifierV91CD3 {
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
    uint256 constant deltax1 = 10196748315686696845089760649492635283303301567997665487198130029312059997182;
    uint256 constant deltax2 = 3047943276161978736493077525398964357964474678339044300194302012343219332462;
    uint256 constant deltay1 = 17232303027159624451528512863820397041104861002773677868934544624201356959340;
    uint256 constant deltay2 = 3998219649210085871479311531607829091529415392048818619156247382043804188203;

    
    uint256 constant IC0x = 13840807453712636375689730791119220804479201100535350938161662734137660413649;
    uint256 constant IC0y = 3755064674211745512106826098859283195056720794733482411356864490657025347575;
    
    uint256 constant IC1x = 8071755465335986535395839266943073384401124051723749086749215470532307321983;
    uint256 constant IC1y = 18320059604414969523818354136034734555922250427885853858973205738279769300018;
    
    uint256 constant IC2x = 9743440384923345258995330516625559209834380237290135444933697299539235986373;
    uint256 constant IC2y = 7217455430620291896102712839982520226066357849527384333151301528123961576375;
    
    uint256 constant IC3x = 19791359679107234998251504462629322422292192458102947397741644312815626671431;
    uint256 constant IC3y = 13350111969872116183556484369260881300516213796267901599410895639731209489682;
    
    uint256 constant IC4x = 20566815938851058659785133779356857901542283857931481990088785117748936722532;
    uint256 constant IC4y = 1520328937321826662137255784651777817054865613020284828398228043126005159027;
    
    uint256 constant IC5x = 15583839021884798030896425997314854485177702663370384286885420257563765742359;
    uint256 constant IC5y = 9650231869401425788706802024548959620727372747826962627267667236168737245052;
    
    uint256 constant IC6x = 293418809351587590412692224241446063524142668655394552246342397622801444801;
    uint256 constant IC6y = 20267973248366080050523301227728951515772979373159177769347593871109034924439;
    
    uint256 constant IC7x = 12643224405331737641771880671830591199059756264308334114005431973683658347842;
    uint256 constant IC7y = 4754857172657096930558030850901869616094581200526498470373716105977986876161;
    
    uint256 constant IC8x = 6844718163547974070786870178552043717909625495923821142637546603673071920376;
    uint256 constant IC8y = 18679056329996490763494955149183942137790639811833889780709770349837464256941;
    
    uint256 constant IC9x = 13320767803597140754414195368293878598429461434495517792012900257830614956156;
    uint256 constant IC9y = 9474246084224842855908768529826447300698219787729581596457266680617419445705;
    
    uint256 constant IC10x = 3570598449118696831928738385246867743552076584150489518426218890198042800366;
    uint256 constant IC10y = 8048145716514231280989050459283844020546225682522318729920851385784828545907;
    
    uint256 constant IC11x = 4798556345470039003003356544931598821127958917165972205371875138116116220040;
    uint256 constant IC11y = 19770881424336983784207248407554952841133708473831767124795398732030762357812;
    
    uint256 constant IC12x = 5959700991309457658002192729450429966720795193455946183433387355744156711478;
    uint256 constant IC12y = 20941737562806798724439604899956531443750678080003689427401920751962530732555;
    
    uint256 constant IC13x = 10424353190651424676951135949569591715466462332679489149826208297094022703136;
    uint256 constant IC13y = 21291055668601465380008219799810302703746473084661459184276021199688049077932;
    
    uint256 constant IC14x = 1379320363307262393178976605057325466581312036986986555530071402581563013947;
    uint256 constant IC14y = 13196525281449223250355050432097182386858016718701567715981025888713854476479;
    
    uint256 constant IC15x = 21119062272628363748210564704660098388239055697689132060404753085088422625284;
    uint256 constant IC15y = 12599076774280303492823921927224522543652592248851680338802596236006581096899;
    
    uint256 constant IC16x = 18501360883134284799281962301892045375152343018004074508794328010413525323649;
    uint256 constant IC16y = 5900397066479260061824958918754938964909794060389014597128829184159515871959;
    
    uint256 constant IC17x = 1965720645331497480393920791303405583455364134426554079134638397129171172045;
    uint256 constant IC17y = 20416484499203304863607013378154150492082150029803421218686905821425883805287;
    
    uint256 constant IC18x = 14364727382220437089200105527963529541770065651130307266409119247177049527507;
    uint256 constant IC18y = 16232794639337480390927374641511795690556916023661943955451618284210801948111;
    
    uint256 constant IC19x = 10587652013667084373813238550810566852462413209701467995061627953760082731333;
    uint256 constant IC19y = 9318380056122937496866695547645116189328231525470112432094659895402980269560;
    
 
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
