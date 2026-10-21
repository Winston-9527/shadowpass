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

contract Groth16VerifierV7AD4 {
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
    uint256 constant deltax1 = 17122725048331343669155981592124776347064633497560350694546269090246641711915;
    uint256 constant deltax2 = 6603117096256711645832072188756485532727267846410866373113266101444187955116;
    uint256 constant deltay1 = 15754236438666260705479143626300867469922026865933256618670468723625736755056;
    uint256 constant deltay2 = 11413954759343372849711687292843019517869562881777545090085839655906179631322;

    
    uint256 constant IC0x = 5999190028712438780370131554174350700400101169313641305101525220487404868110;
    uint256 constant IC0y = 11844223564565348983394895615656564145204930270309271805855785101375835013995;
    
    uint256 constant IC1x = 6079594563134177874321596415257879232154813920732902067317301508260491233579;
    uint256 constant IC1y = 10477629823839873835900986159197879827003935967322255245088191446681721131534;
    
    uint256 constant IC2x = 17117689540399724759560013050406558061097046204844428035172973074436541908762;
    uint256 constant IC2y = 8976476895388552443839699899240661859308363496096424495439726267143081063825;
    
    uint256 constant IC3x = 2349453841045951973284121993534975903992287972308375085146881042810058157705;
    uint256 constant IC3y = 19004942292498943232628617943615038712115459141235866910196812071318123161590;
    
    uint256 constant IC4x = 2399746418552510084035942023423695419437471570706883389818543978532717888056;
    uint256 constant IC4y = 19663536178271445148788486251498257205151569900750367414783255421630682978582;
    
    uint256 constant IC5x = 19348402578771597766693484303459674684610302923470547317037889729492521300342;
    uint256 constant IC5y = 5235071326449479597761477536396057713561944053048267173062853471094549260975;
    
    uint256 constant IC6x = 11362341307138536075127027581710324256190732772662257313373062827064234176882;
    uint256 constant IC6y = 7108318058111036795037956162310291009162324667477630484480742036387057671931;
    
    uint256 constant IC7x = 7388133459327510782082574888944640760501976465139987702572970077456639299711;
    uint256 constant IC7y = 15578925281205577945884252637437213128601309902791399703890310972210839711435;
    
    uint256 constant IC8x = 12377505720063315176939878172881834210952293707774792663042629031938963637389;
    uint256 constant IC8y = 15364325758350623303797718092453942920007373251525856756236493218388159940640;
    
    uint256 constant IC9x = 11829245647637944527535339952949015649606681901229362149351138066657373520350;
    uint256 constant IC9y = 10320890560435610139514052601319515157224962754992186949676022268619896542656;
    
    uint256 constant IC10x = 20895814971223227375051612494190133509984463018824816068414123304042730816669;
    uint256 constant IC10y = 5081643870512462831296653003681165214566625578054175851943334784897317409440;
    
    uint256 constant IC11x = 11027553873577957890370457130054113675047267145477171554343673885750737828062;
    uint256 constant IC11y = 10070505309287935482425262532852070567599012444916792957408812457329839759444;
    
    uint256 constant IC12x = 21250880303956901688444264144015331810439864768796583288655007079452096955858;
    uint256 constant IC12y = 11229705957610875661264845874711901788455534535985249909310054167400080241802;
    
    uint256 constant IC13x = 6043926140229576782126199736075823766701695232100273630426893998318118480515;
    uint256 constant IC13y = 17014639833321697572380204680928807931350943089364052338921355500218811599740;
    
    uint256 constant IC14x = 19831707049655813737392721290845953998268136925132499419141340646428319429424;
    uint256 constant IC14y = 17556926836765988168630866529085166035472483673290549139506797376882392087889;
    
    uint256 constant IC15x = 12254816409933692546427647244703538097327439287220852979815086641890963087351;
    uint256 constant IC15y = 16811076118537136543809640597394733504765909552753656501779709927329026042567;
    
    uint256 constant IC16x = 7854166089213050518660381156524868987567086963146536848615030959756510917924;
    uint256 constant IC16y = 2275381869137935245445726719321691476530222118816749730449726508742605991428;
    
    uint256 constant IC17x = 12514369462276163543586985316975531331738861764911173381169846934136163815235;
    uint256 constant IC17y = 12137460379361325231152280144198066468630138286500090449452626675303364824002;
    
    uint256 constant IC18x = 20086326193072190963662374390061865215802874270708363889035117047828232586272;
    uint256 constant IC18y = 20216173941947273828939207645057463701738497177039950329850419994658735454490;
    
    uint256 constant IC19x = 13191467220021290131460174798585032250041516477179062321416650848577264552705;
    uint256 constant IC19y = 9743759089380304773513834604440464545838558186803421401886549851091240248535;
    
    uint256 constant IC20x = 6525401742323541110240942375492478102122204342916337723565214916530166411228;
    uint256 constant IC20y = 11224244678484635406410195306708182108247298800790533191520729962298273418575;
    
    uint256 constant IC21x = 17051536730632475441186830452943450911065222497342175697225507607713851905060;
    uint256 constant IC21y = 855876714168430239877583299331526455015441064233764084270202972692696417248;
    
    uint256 constant IC22x = 2633860287485881678211175774265004516537933990470820456299192407689253663689;
    uint256 constant IC22y = 3757432280354979063107681904363679855805595747106142383207091505976678333689;
    
    uint256 constant IC23x = 18657433625328339569638126259631106722834868344178811621633799366988845602757;
    uint256 constant IC23y = 15425540142258728169143777157991476970386491183825772243306725742270082101734;
    
    uint256 constant IC24x = 21734072463244699377864419457327174816171549657204707598556527643102628071326;
    uint256 constant IC24y = 21283017864005262894312117268899024235558855895543955165699730998317943427358;
    
    uint256 constant IC25x = 3362614117612732802502406629251154928502274645401152662026247114164123809726;
    uint256 constant IC25y = 3663073079454483776716231613422011997186772038401367271941975530113750852840;
    
    uint256 constant IC26x = 18084940171786808849073455540733669570414376960536741910136275212195053171682;
    uint256 constant IC26y = 13959082250101143799658657448810140983790729904150896606191511169510108306469;
    
    uint256 constant IC27x = 13582594953488291081006496149993852631136187800894209570194700622837442169284;
    uint256 constant IC27y = 12594650360230247585288992019549387141945981345117554246319990879108752047873;
    
    uint256 constant IC28x = 8227390494284990454006536578980555582215779200728420575060399236526340014927;
    uint256 constant IC28y = 13146968096154643818150493388943756072217776772702891388408616742307559392094;
    
    uint256 constant IC29x = 3224717830733793126028078164800437495736233131792187622812087570001205747941;
    uint256 constant IC29y = 1955680137811270993761456539095010883226832095932618560304294444094838280503;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[29] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC26x, IC26y, calldataload(add(pubSignals, 800)))
                
                g1_mulAccC(_pVk, IC27x, IC27y, calldataload(add(pubSignals, 832)))
                
                g1_mulAccC(_pVk, IC28x, IC28y, calldataload(add(pubSignals, 864)))
                
                g1_mulAccC(_pVk, IC29x, IC29y, calldataload(add(pubSignals, 896)))
                

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
            
            checkField(calldataload(add(_pubSignals, 800)))
            
            checkField(calldataload(add(_pubSignals, 832)))
            
            checkField(calldataload(add(_pubSignals, 864)))
            
            checkField(calldataload(add(_pubSignals, 896)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
