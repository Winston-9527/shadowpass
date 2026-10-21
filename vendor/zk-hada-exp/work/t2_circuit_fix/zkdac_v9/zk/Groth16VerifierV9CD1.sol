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

contract Groth16VerifierV9CD1 {
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
    uint256 constant deltax1 = 11624701078402695956366408421448884507855895772443931954671597389537679614374;
    uint256 constant deltax2 = 3818964585048589376040337505532456767259747569674017001830766545762925549298;
    uint256 constant deltay1 = 638532750822681484419556939592328578497358081757217513296885636772939954464;
    uint256 constant deltay2 = 20235566218118758061771793295571180718092734957633716970759734495065912425330;

    
    uint256 constant IC0x = 17797694571087198501208411774900064546359714139071977814288491974814228057310;
    uint256 constant IC0y = 13177985706026732958862470451673755721532666158483230275719252385298595836385;
    
    uint256 constant IC1x = 12266730171076115286958814686297380154724394764501691135362772145390863819142;
    uint256 constant IC1y = 20507044668805753721970820924777017465968600573704392992494225406273944709218;
    
    uint256 constant IC2x = 11173335470937022329431310641723271620593979571617324081069989117824542783450;
    uint256 constant IC2y = 326513492666884296614198553748832546930109432417587324726109917005243485983;
    
    uint256 constant IC3x = 6967774314342953625000560806114176194918638038288045207221191954473434663814;
    uint256 constant IC3y = 1338415803389796482723042837161824625812683260587318454036239622022720121322;
    
    uint256 constant IC4x = 11797761181042782807583265774740549367397172987675576467520554159891747036553;
    uint256 constant IC4y = 19374973122268178249121661143374636184141020942338472625170329134647888184625;
    
    uint256 constant IC5x = 21719870479927486711471764944157260247894663515948041634611172813001788381296;
    uint256 constant IC5y = 16163169070537303830444546197590168650240201641507044601725752082828710829965;
    
    uint256 constant IC6x = 10202226396549642305220201329782529774963784616145196253072130828911691798408;
    uint256 constant IC6y = 19477909853147983957478455588765970679820112331496334943053235634488229951755;
    
    uint256 constant IC7x = 10031500480019928166030287027855476801043571365469030910876803026214780333034;
    uint256 constant IC7y = 19084893384001976968182073609511122837247233993058618550561800857685123893139;
    
    uint256 constant IC8x = 21740137608518548682434107513802473103578858972899615514456950370632068404611;
    uint256 constant IC8y = 15971572434061629666935448358131666507839049422077120494381350983344334018299;
    
    uint256 constant IC9x = 21661248665267956043537043920302940492174863526270854542365456164309425533936;
    uint256 constant IC9y = 8279598358513934441487833482919274170275659593708755413741713554399982903035;
    
    uint256 constant IC10x = 7764865515218554822564627064828212681064618772322866554159474045719442205643;
    uint256 constant IC10y = 4325346771331716790322101540697325944260374944521218807004294946347910000424;
    
    uint256 constant IC11x = 3349280671278232182473450727608197187784791528254265802674458781667826550493;
    uint256 constant IC11y = 21131513310810147616447130561459961967073140698272633390142358585674013805330;
    
    uint256 constant IC12x = 20676145073448704587868085003831489920070469296564319492061753936993701028825;
    uint256 constant IC12y = 5189340134906566940702444295526716111658148698059007600103168457824839421004;
    
    uint256 constant IC13x = 3799073443783701496390032045177755060677073508356435599853448914511310743286;
    uint256 constant IC13y = 10429936179087241941259114310306459698841406432117790268910731705652055868779;
    
    uint256 constant IC14x = 2611858092075703817549593879764238233545896565317383632700374563648763711062;
    uint256 constant IC14y = 17189554049908070840786425905687670491824477850034230792083518334356969945489;
    
    uint256 constant IC15x = 9642125667425213001187108760019305078643621493197282332232293099638476898250;
    uint256 constant IC15y = 2956656053557618598807779844760927916662617986420764975611570651595695320743;
    
    uint256 constant IC16x = 280801219453327273541306585767212054663224706440406997930127987405135474534;
    uint256 constant IC16y = 4322106002049215156844550027116235402565365726326021871100980664000859551283;
    
    uint256 constant IC17x = 2179898593927078091409602912881006072752534943923450406637113434997397026427;
    uint256 constant IC17y = 11867009441842325746196318142369680353462529793625008784358076798787920596252;
    
 
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
