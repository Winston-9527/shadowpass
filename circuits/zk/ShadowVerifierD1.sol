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

contract ShadowVerifierD1 {
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
    uint256 constant deltax1 = 11995063817377177520201521755333461539984481308991832886302166686045738490811;
    uint256 constant deltax2 = 11037709943677064960893331982157472981497555488346197817215115567121033423356;
    uint256 constant deltay1 = 21468442270753774556542094311746742210458303846173952659772350666650595233000;
    uint256 constant deltay2 = 1394575645886336862208846080644658751434223019595339546190933477947170215503;

    
    uint256 constant IC0x = 12418154430815166185484801263775570869650843126335207492751697825101840912913;
    uint256 constant IC0y = 14688273744578454889847244628949451930208084998185556820835204341758686640189;
    
    uint256 constant IC1x = 21007843838989687930108777472686811409009038962871605027416479758435001583066;
    uint256 constant IC1y = 7943555872804742105130008798375552810659636851682163419983540538538198472718;
    
    uint256 constant IC2x = 6691215415563428623658366389277929179128722682327333004362583933635696658632;
    uint256 constant IC2y = 15875850590350365537585126001018779479863648255119241242200303567377508483758;
    
    uint256 constant IC3x = 16915033065409343510461754109501108069051419075506786688182396740163055896445;
    uint256 constant IC3y = 13345870848948215857838980570618696276733621195217685989332021549450944264841;
    
    uint256 constant IC4x = 9643648433820177846187533686198478877398282162094708289378835945560120005176;
    uint256 constant IC4y = 6756352670098419194577750436209300577112991592422323926169209977004193156239;
    
    uint256 constant IC5x = 19917153094180005889139102851644960325695659408978484129891651006556185894870;
    uint256 constant IC5y = 13963930362381921188977779362715619555780422759737264946994437104314482891084;
    
    uint256 constant IC6x = 1848295326358218608778867074454882687746366907408751455426036004293816771724;
    uint256 constant IC6y = 2925966963103974504105566778828674832812083463939979262911841043343929505092;
    
    uint256 constant IC7x = 8669758687610159426270061412396423905784438936975353121583394389166289314696;
    uint256 constant IC7y = 11336029053399207209450833387021983096106086042857439489776828241196078450608;
    
    uint256 constant IC8x = 4033768938608101903904768227151444859695130811970867272209657669026302873322;
    uint256 constant IC8y = 13753708930559765601820754385194224517251246843353694717500960840157027541602;
    
    uint256 constant IC9x = 9902482079461104516482194075749420265512112573084948832714360273072678657571;
    uint256 constant IC9y = 20271011200022324679537228102464408535275610406169816551230187550597004089310;
    
    uint256 constant IC10x = 2740582831556185742411589919473573748496283635020644925651129570100254695532;
    uint256 constant IC10y = 13125262503701928965355952177319463717564284110770445716857905490799149992521;
    
    uint256 constant IC11x = 2529846295124314239064092592012027330870351110058884625411638266585513118983;
    uint256 constant IC11y = 5497361830724652756557920804464564690571152784720851876182755224893695790726;
    
    uint256 constant IC12x = 18686185636037677490197041942500369116382521418674601359374689366581067387079;
    uint256 constant IC12y = 8612411572310240114941442197478472383420975647810466208168909649854994777239;
    
    uint256 constant IC13x = 17244734391798328319349619701120652614195556497208717972757971357417969521242;
    uint256 constant IC13y = 12815467923093484391592807049058538817590543684419489363435020991727211695332;
    
    uint256 constant IC14x = 7669347117599317501471043817825970938380013436407666306429162298259305701112;
    uint256 constant IC14y = 19902002204962263515421589339559265003895183699013412720842302512602125782305;
    
    uint256 constant IC15x = 10723773782694121676645435052649329496973398237564921419997184473582854434965;
    uint256 constant IC15y = 8117055670717835477330708743600879661048271540153011698606094856623623025642;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[15] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
