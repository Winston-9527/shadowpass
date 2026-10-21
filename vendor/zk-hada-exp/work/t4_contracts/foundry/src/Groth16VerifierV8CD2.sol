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

contract Groth16VerifierV8CD2 {
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
    uint256 constant deltax1 = 14176362598105836992996823681339454220903046686450937816656591963657453245045;
    uint256 constant deltax2 = 11521958890871791336388361096609687169793217963866454980324099743227415426201;
    uint256 constant deltay1 = 21853441739785830601003807967604077055869723860598564061358142920688878850947;
    uint256 constant deltay2 = 16211385374195708888253831877383750949100384947799965607331780070180769227019;

    
    uint256 constant IC0x = 4858326137607748101312001806630765887902806593496473919863325626026146440255;
    uint256 constant IC0y = 4965776164226668657420947306816437158851435597954559284504044677634650198426;
    
    uint256 constant IC1x = 11110124250585463195640840306102954435212114184713882638355474135004698331044;
    uint256 constant IC1y = 13520004794671817264222503475642042116352278110852057780086979364806400653997;
    
    uint256 constant IC2x = 12007611468571048944398172063195747880980993018846757861459880676046293654036;
    uint256 constant IC2y = 13503528836526181896177109367646508046699894174886749756067633266295588100046;
    
    uint256 constant IC3x = 2007361150682917320945055546975694334278964652772463312453708822111035508356;
    uint256 constant IC3y = 6524281169511637114336815286568779957525193677646290597079505913438831026767;
    
    uint256 constant IC4x = 16980328134226253653923513150340184935081202795796438412689551862942309374201;
    uint256 constant IC4y = 7275395868408750014456012352125253216028104175458138186111712746292288644066;
    
    uint256 constant IC5x = 19761020879463429590184602671672986776494230089864403044705739223360101227427;
    uint256 constant IC5y = 4561816667640143164915805529303981930069392042671634574825155266100656523409;
    
    uint256 constant IC6x = 18443530667755634773253846400354114829041678240681947977427626314062187811818;
    uint256 constant IC6y = 19384700128940690717207234349600752916141816955070102370193944161328978534622;
    
    uint256 constant IC7x = 3108970928978212101927949101812765525650723581658172806192125571546329544771;
    uint256 constant IC7y = 13184900913935965127459532788793064668893454618790691803144868765865188812782;
    
    uint256 constant IC8x = 20868936544427737961765817585801435499392745489981088450120092917100757771214;
    uint256 constant IC8y = 19476601608861830618510336286339450630466994552458996667822655009378445792925;
    
    uint256 constant IC9x = 20450731050794280731545472597523291369300193050948183158278852962895709150606;
    uint256 constant IC9y = 6014151764967504433120644207318728246019778455412012284482719054764742837709;
    
    uint256 constant IC10x = 17993691463875364755676845073546697179631594845502719445966788777740186663654;
    uint256 constant IC10y = 17399334793399594122355496306560100722042452689851967496139429423916730005179;
    
    uint256 constant IC11x = 20551090519705036468494504011469693492416693288374203094107418495684247969869;
    uint256 constant IC11y = 8816206716919194504166566254136029059164877208493509173905413025437585469629;
    
    uint256 constant IC12x = 1730456911118741526087316808419477892502659662506240064305317765071447651610;
    uint256 constant IC12y = 5081702329599857775342756424923124295333663837090580453559353965445707160581;
    
    uint256 constant IC13x = 2281414997825138612363904051357613998979370521727496264271890939588184492519;
    uint256 constant IC13y = 3828399430129638253589993456597949774868102758957558507916589301170595607521;
    
    uint256 constant IC14x = 16519086829859033943401361228014502245306295191790683858793147129568299426100;
    uint256 constant IC14y = 19117627510247162964091526186584529568853125856098123850212163015346824885451;
    
    uint256 constant IC15x = 3985591445783516115721102286061471908777151802192661834937533700390883880797;
    uint256 constant IC15y = 18764598342662853502054621877530706918240576300097286899679007586713628995752;
    
    uint256 constant IC16x = 2528323388962495274473858939182395494205927807584204116130987572285769856022;
    uint256 constant IC16y = 18720290798364348156504352212530366293711125496805597906816965718973789321057;
    
    uint256 constant IC17x = 10471022758333704190042425314388353648258749971101986296934046275915924916114;
    uint256 constant IC17y = 6611830403804923372467890076847076991161388499082976844079505787299260784544;
    
    uint256 constant IC18x = 6664364163796045406539448592475123269828783338327601997866480077569557906546;
    uint256 constant IC18y = 7861979610567469872682635700364151638620201083186712681391847023139292038492;
    
    uint256 constant IC19x = 3048274153422238148628962660702989733859553849440902569690954605497114173416;
    uint256 constant IC19y = 15366786632313981471340508644515249406792911544518930754869119790568438329459;
    
    uint256 constant IC20x = 1257885938116495047767638160389042930689921837936323475904585063450291709866;
    uint256 constant IC20y = 4472434861166042587824955776560685179352218125356879486424327691830566454908;
    
    uint256 constant IC21x = 18450787354276637937324222289786816075054125852785913657851083399769032893277;
    uint256 constant IC21y = 19891171255661779167709922085641577659543654700184831196093883548598750343388;
    
    uint256 constant IC22x = 14635193879433162706635091348002125644265623200071034283291874999212597554223;
    uint256 constant IC22y = 12421863708945755194332800678385166162044088415173363096990269004225075857994;
    
    uint256 constant IC23x = 2765004080052816978718283863041106410610159143241371302263943595168008079817;
    uint256 constant IC23y = 4738906338145338404766152783293731948689304454038806936266460475574680294503;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[23] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
