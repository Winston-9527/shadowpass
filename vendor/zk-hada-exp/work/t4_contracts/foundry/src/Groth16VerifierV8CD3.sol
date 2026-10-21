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

contract Groth16VerifierV8CD3 {
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
    uint256 constant deltax1 = 8477188864688454458566234865224911352038948896443366146536238074677523109822;
    uint256 constant deltax2 = 11021831862039229894814973526712086648341972794085814858353556429054052329043;
    uint256 constant deltay1 = 2413983986877922056211482488301916208904296131461180432620387759978352870532;
    uint256 constant deltay2 = 15875214383145476653151355679324471715867543333754470407105741739119283618012;

    
    uint256 constant IC0x = 10026881437365300822868875996137491362819389876517725952067166165666310614596;
    uint256 constant IC0y = 12267672367172524538598712660167436660683559386796969570528260490348940317105;
    
    uint256 constant IC1x = 2242433390546500015448240958713086163010883144800415393816139543839166004318;
    uint256 constant IC1y = 7653858620402540082225462156810472044333939632682493515351095023770823443450;
    
    uint256 constant IC2x = 18364872168605204761849065456937130353808323874636121705536632879889116544959;
    uint256 constant IC2y = 4450407929309262397035161166256791665135113915222079079458629206012606876328;
    
    uint256 constant IC3x = 2718430213410118717496594981539145164706887098680340272219485074277321968108;
    uint256 constant IC3y = 3238975440876858536956628283488808019638475580970767715069559411920827923335;
    
    uint256 constant IC4x = 14132173341504689408654801131355358070523124231811012798519298109716037360128;
    uint256 constant IC4y = 17218373633546589846679609281907696334467489366438602816139941346223717149468;
    
    uint256 constant IC5x = 9309884514138206282535085401007700604910638406056809155462274072696552208326;
    uint256 constant IC5y = 21004999599197678911179499638404125376161486849690799783728416566883848228829;
    
    uint256 constant IC6x = 11729944921859066856925335337588457603027353500393259343444693925085450506252;
    uint256 constant IC6y = 2730239184120439923897400052585500034868383769704965285097706380826402426844;
    
    uint256 constant IC7x = 16193601331216176801378095009683398537556228915970409529241181628013815735869;
    uint256 constant IC7y = 7521175438273140679439788572632134494398513841232565505340283877087803184634;
    
    uint256 constant IC8x = 19223233244179928863340750863714184637609161825042995299013214215604944000366;
    uint256 constant IC8y = 21776295231621704564390117605484628906260808054891972636782722806270256629235;
    
    uint256 constant IC9x = 10604291038294410967871245711946904656492532283653654774571943860542737256325;
    uint256 constant IC9y = 10583834571433628128291826708512820536322715712831145491387020643288551427620;
    
    uint256 constant IC10x = 2291529099009852482733462508962107215547342188118672502622024232211310008807;
    uint256 constant IC10y = 15170343238344579090932850437038197511271696966740072808619739787397072012180;
    
    uint256 constant IC11x = 6811352288915402486167221091049496511749887770728764594227604254258869517566;
    uint256 constant IC11y = 9815245957159782261858824636962324233609979878381416037404465109908470289686;
    
    uint256 constant IC12x = 14221016541116936412935616546335928291775619343541125392844078195341963438044;
    uint256 constant IC12y = 858607468593497634674602387823486980856416095895121033568020141073467253158;
    
    uint256 constant IC13x = 2976422713403309240774800178738474680156148718556349957469740438695540261233;
    uint256 constant IC13y = 679294259025953439297434590316226922349328283456771103338520546337090751894;
    
    uint256 constant IC14x = 3869527487564642064238624944295058735490244244942492497849659438483185804917;
    uint256 constant IC14y = 7736113641585462244362636668868863585538342937740553300384388716636653149277;
    
    uint256 constant IC15x = 2051619162713810247984022744452125145798595719858560098040254361276988245153;
    uint256 constant IC15y = 17012312571138489184810970850622609016224935570217357489074924980449298915550;
    
    uint256 constant IC16x = 17369021932764031464035546353494795765889428903060431539609439821702247270601;
    uint256 constant IC16y = 4326250940106263610699166933784697620638691506015388955312454158577857238703;
    
    uint256 constant IC17x = 9123127114973145672460271421038643350868022572350121409909986273904496268282;
    uint256 constant IC17y = 19149596278539613337513195152389136277052073636364738488684732677506803074095;
    
    uint256 constant IC18x = 11310814489650483591524697569342383189223249164403461427340473679342646427585;
    uint256 constant IC18y = 14456152491831782122312378463533883224828991768164379266166457793916979353481;
    
    uint256 constant IC19x = 3239373131219160257344887516895879359634105613806956530652899878406831128501;
    uint256 constant IC19y = 9170495872992651310968381214105973579346536011898511881979701336802013144355;
    
    uint256 constant IC20x = 11027427043226351031178892914077480347801556758944872167005155098452167567114;
    uint256 constant IC20y = 9827055338445785005211872360008642126347301328139035344471071197774489202747;
    
    uint256 constant IC21x = 7943889961417498132501397464821929120292626003059473184737647589412006185989;
    uint256 constant IC21y = 10143723669913383713343328986777448790148883486091063581212433175926688424166;
    
    uint256 constant IC22x = 2310014104522137079356131742387300096487952192804914096033752408919582875545;
    uint256 constant IC22y = 21221388900948474182032651841621191189419306513663773824778946789496050442659;
    
    uint256 constant IC23x = 15246131352611755806884516122280211745128690881054551192136697833432967380525;
    uint256 constant IC23y = 6870973356838055486947289090259450280141157574402319880839108890517832584077;
    
    uint256 constant IC24x = 4080816068197141242183124034579621055357435412766216502106376753372453211747;
    uint256 constant IC24y = 15324422544467176412076276800083959279778577285856218707756567148961650156137;
    
    uint256 constant IC25x = 5762494231387017828086536556468743227315751086324485776810248409883114524723;
    uint256 constant IC25y = 14490274699981692748489768984464769715935037802230552184184266050247001010111;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[25] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC20x, IC20y, calldataload(add(pubSignals, 608)))
                
                g1_mulAccC(_pVk, IC21x, IC21y, calldataload(add(pubSignals, 640)))
                
                g1_mulAccC(_pVk, IC22x, IC22y, calldataload(add(pubSignals, 672)))
                
                g1_mulAccC(_pVk, IC23x, IC23y, calldataload(add(pubSignals, 704)))
                
                g1_mulAccC(_pVk, IC24x, IC24y, calldataload(add(pubSignals, 736)))
                
                g1_mulAccC(_pVk, IC25x, IC25y, calldataload(add(pubSignals, 768)))
                

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
            
            checkField(calldataload(add(_pubSignals, 608)))
            
            checkField(calldataload(add(_pubSignals, 640)))
            
            checkField(calldataload(add(_pubSignals, 672)))
            
            checkField(calldataload(add(_pubSignals, 704)))
            
            checkField(calldataload(add(_pubSignals, 736)))
            
            checkField(calldataload(add(_pubSignals, 768)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
