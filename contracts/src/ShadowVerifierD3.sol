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

contract ShadowVerifierD3 {
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
    uint256 constant deltax1 = 18879006038299347328923906271545749209322599934107073059567734027068698652767;
    uint256 constant deltax2 = 10778156685738225913191498103055575652438944748492332374214286146467198764165;
    uint256 constant deltay1 = 8387024129230759911900035040795918341453453761548783748880852074269038199220;
    uint256 constant deltay2 = 9892443044992157777532711130517660552355762054001358891672448607970122485139;


    uint256 constant IC0x = 3681633957887766046310555383553030292025927513328022288323802896690476172368;
    uint256 constant IC0y = 20069994175791892086186055966737945148090313062883394514671001940897218395742;

    uint256 constant IC1x = 7880480273339813618137446771779438791501541898814477507598266356604173856428;
    uint256 constant IC1y = 20387373013873821782016287281034186682476333246233054738395035268548330834684;

    uint256 constant IC2x = 2314450870543062586081203269452502928452450129103368651179017672324829650882;
    uint256 constant IC2y = 3496892441715747496718032402930228578627279350401557012172557187751160435493;

    uint256 constant IC3x = 300932509508995447797699705529370639626027111546305295149603617559038289393;
    uint256 constant IC3y = 8628585453690843942616326470044875900561521641656369216450304627844497648735;

    uint256 constant IC4x = 7208407591969165598657151412605408026725668800062256911660903398133794660960;
    uint256 constant IC4y = 9886061306245176662126419612910801685409861137446591317239650962692243592001;

    uint256 constant IC5x = 5440838583448819961394286840780947096281083817078305605687558801213675270042;
    uint256 constant IC5y = 12269912424316065428073342184709585416097543117580307659736126965867243624593;

    uint256 constant IC6x = 20022955374738173990659680732952542092477202351484010492404154581519453524143;
    uint256 constant IC6y = 521173244828268308157751707301162573342848282621054177796608661252854719250;

    uint256 constant IC7x = 14390251773684317596482042288047809317896389402966962592907018043589936240262;
    uint256 constant IC7y = 12474869417565889746787865885473487759839465714546583336499193537838223993335;

    uint256 constant IC8x = 12748357326049554773595954147789495227182456756414839362872298979523171960943;
    uint256 constant IC8y = 2933520501040493165556106210159376197501221589610563954168674145411425489758;

    uint256 constant IC9x = 179983411810811039485129828350638006932445560525274287263391029195641799672;
    uint256 constant IC9y = 21825530130419215449553909842324786595629662154494004269913152861004018920938;

    uint256 constant IC10x = 6257892280892214256392981154186632674922459239332285221244471693384849753098;
    uint256 constant IC10y = 15397129467794228052357392312247534610573427953917293997044841156305224907143;

    uint256 constant IC11x = 19357921761648089269928274911682307072415400444885984227406844358501557734717;
    uint256 constant IC11y = 9557877321454165363639831413275867480523219351629651182408315283103455587237;

    uint256 constant IC12x = 7608287712239393856835140479115708691598165256442716290007430118426889613603;
    uint256 constant IC12y = 12250593261489715424202129599497775541879842647577208863453024456144578209106;

    uint256 constant IC13x = 10153496653764024233458467147340311776044442604716283507140690403362756228941;
    uint256 constant IC13y = 5321734160886379788377385199230569368135711804988503041834264102376964537726;

    uint256 constant IC14x = 11738555761582200032665515199748641355104918959605349264581851167148353201026;
    uint256 constant IC14y = 7635968375501006320370106829289335479766749375242040917512993390540552320388;

    uint256 constant IC15x = 15187804556808290549027036364074203101383012845543075959924785775848025173593;
    uint256 constant IC15y = 17272441150782425633459482741106719450804473674938660771806025431771116931402;

    uint256 constant IC16x = 9830385320860002299167736545634729699768054834255236493906986376007987505396;
    uint256 constant IC16y = 2391139025042788050638678056054530469780559458394139771210075980961901485299;

    uint256 constant IC17x = 15400893912558895221571976141957989639793068977340528071823047842621058904510;
    uint256 constant IC17y = 4657867993302584595667264740055397560785823848283981027635784213129065113145;


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
