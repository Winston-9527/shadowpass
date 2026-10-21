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

contract Groth16VerifierV7AD2 {
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
    uint256 constant deltax1 = 10320763399850949107470471344466640829692964699321445780094269124364110845670;
    uint256 constant deltax2 = 20633016861258252011012078407544508590187313923825511178932899682875044553061;
    uint256 constant deltay1 = 19278674628088415412247501348099035557169581509920358200176055901011312739251;
    uint256 constant deltay2 = 20695063761540040226398770698591643440085511778931025466388118852503971052745;

    
    uint256 constant IC0x = 3712798207283374850707779876703105819981615137133855356915845642214661392010;
    uint256 constant IC0y = 17027381302792649919111300559572252529076210707456329704605209346883613424347;
    
    uint256 constant IC1x = 15383681337963156334529138227702321146532912248848332288134247904223045928936;
    uint256 constant IC1y = 21446280580428373814624088790831828462778646266373162799292333144705841943725;
    
    uint256 constant IC2x = 12505997539520711291232371102574441687479892602601199539413741847168304317030;
    uint256 constant IC2y = 16263632055424243491255562131837515369634618329472911405908024244113026141554;
    
    uint256 constant IC3x = 10444081472420824723786620353190264598273964215010838954938044122965744895963;
    uint256 constant IC3y = 14862569992161034885223050150679699383968873457100646809128822743317238196669;
    
    uint256 constant IC4x = 17436431277586582236106473967335258124339692071151091141345915675050550275823;
    uint256 constant IC4y = 2170794742094597253948919134594314752679429798594936910130887052582674038012;
    
    uint256 constant IC5x = 12573003657460651044556664744692571312352101813590261730891791996487376166072;
    uint256 constant IC5y = 9193817670870737487792524261299849320896917129636374537660398711574029334176;
    
    uint256 constant IC6x = 16684843824591662612624684146567164991114949948096590290987452706540892218532;
    uint256 constant IC6y = 17913592977737866122594157033265125856667556576506842822316860687118600733317;
    
    uint256 constant IC7x = 105072897867365078646624168926206306806507912510669195886922184012173852131;
    uint256 constant IC7y = 6493351866336866365664824374020484478532791592517595842200025925926070806186;
    
    uint256 constant IC8x = 3414413301266649254199775691461048587826486084960811914261692384445569709876;
    uint256 constant IC8y = 12802609636451626389528370840397825680506340104211657589483851629791586704371;
    
    uint256 constant IC9x = 9809168679851715449177432549442541830401663841224515551781164955683240137656;
    uint256 constant IC9y = 4287232278739870197970511107071302652561035134007033058337248211828690675212;
    
    uint256 constant IC10x = 10269572079083088983854421536537845952651509431403608242198431838574436506546;
    uint256 constant IC10y = 14384754462601382835846032702468536062648387335159700943016787245899704636445;
    
    uint256 constant IC11x = 12774657045648658736209194466739968973250857274067623076330048120926239138441;
    uint256 constant IC11y = 20175595736254792329018031539247935507449984138849985211355679071847193548979;
    
    uint256 constant IC12x = 12144359733433240262260154437838497464041483313701841019329090818398215653186;
    uint256 constant IC12y = 12493527429146055507939101093171573373342191273500562561154063374567186006282;
    
    uint256 constant IC13x = 14316545805625676155117964778046273736861393215985525210652396695457030829801;
    uint256 constant IC13y = 4689068535063247216588092068938931299043307455423713443130471153188396038022;
    
    uint256 constant IC14x = 4073529639470656702551195477080664052309137787315662729205001019572497621274;
    uint256 constant IC14y = 14610789631441071960624172094519464821062404904880365811745174600572442463954;
    
    uint256 constant IC15x = 3576006643130220963238680245467714699345577396240354692454877994117006591190;
    uint256 constant IC15y = 8013371288710162179694243733845467379987488732212267005777367718855390432142;
    
    uint256 constant IC16x = 18557789596872466683654187376428919874166978405488730706958232214383186551256;
    uint256 constant IC16y = 20373957689354090131039106107155156474953630065798077208825202877540350927195;
    
    uint256 constant IC17x = 8781144655680342952488050134109628086255041244461608634728420718367981969345;
    uint256 constant IC17y = 13828472298632605943568497601225347380527200488074165536444528147664532556832;
    
    uint256 constant IC18x = 14352169223216999346963825373000215620691326747861079397490587863863167936723;
    uint256 constant IC18y = 4981917371425437534379024037510759939208366873536070025902185327133580317791;
    
    uint256 constant IC19x = 14521728371682073154000778032492157912297705670188580895973156162815494281205;
    uint256 constant IC19y = 6133469258657980075781709110341526154389432396176560583252801169958953916356;
    
    uint256 constant IC20x = 7194821174900493093031718393100581248370924466655002847886814451387271333573;
    uint256 constant IC20y = 8339644064863869929412590995616889709342986564490794304392786786754903371464;
    
    uint256 constant IC21x = 15784273324262415509261898625462205092858419317405544162459327790839044346248;
    uint256 constant IC21y = 7199493980732755343942254170063885994871379723357851917336064923681646513481;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[21] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
