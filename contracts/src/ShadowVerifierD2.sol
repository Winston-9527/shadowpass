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

contract ShadowVerifierD2 {
    // Scalar field size
    uint256 constant r = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax = 20491192805390485299153009773594534940189261866228447918068658471970481763042;
    uint256 constant alphay = 9383485363053290200918347156157836566562967994039712273449902621266178545958;
    uint256 constant betax1 = 4252822878758300859123897981450591353533073413197771768651442665752259397132;
    uint256 constant betax2 = 6375614351688725206403948262868962793625744043794305715222011528459656738731;
    uint256 constant betay1 = 21847035105528745403288232691147584728191162732299865338377159692350059136679;
    uint256 constant betay2 = 10505242626370262277552901082094356697409835680220590971873171140371331206856;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 18959671932742101745800198893803121786296626206258735840189985470104263260778;
    uint256 constant deltax2 = 5180494706524702156917689292316414343098674356690310580353978406962921752523;
    uint256 constant deltay1 = 8366630987671777602915589573887508050946761647913403764651239912692216451622;
    uint256 constant deltay2 = 4992273357288443765282495188746900710089973386446742487326094658036023924541;

    uint256 constant IC0x = 18173875011483832426920074996780316116160059925277394981337491767820563787138;
    uint256 constant IC0y = 18304062573665512314330126044589694372802804364583358219509638469206356338330;

    uint256 constant IC1x = 8565441656333893704879629218896925644590377491424096035140691155979896064175;
    uint256 constant IC1y = 5157309315792305030396427903908964777574063568176749987559694058140875068090;

    uint256 constant IC2x = 16950815340385524160107683260523086403472268392538224904971216072434229698146;
    uint256 constant IC2y = 5552811522408719343675171832871125338373159848724828278998477991980970956817;

    uint256 constant IC3x = 3845348122873194334328973963042419868698254559685654465957961712267437778855;
    uint256 constant IC3y = 156416575821556972918740872231506929084814364719343191792755471295248850462;

    uint256 constant IC4x = 5759394055169352757088953942933411307759839680989451787521797025827422049367;
    uint256 constant IC4y = 19492316456077374860544536130311143443370922564788712125916838608768291480440;

    uint256 constant IC5x = 2730822001325962806776538673288305067751870370139734163777613719461782426512;
    uint256 constant IC5y = 8257212106467966978844550031577306843828481100085861873198193653059609953401;

    uint256 constant IC6x = 8759432037785479045464499224401242177650665056385579457744569238485899458222;
    uint256 constant IC6y = 9769681811084556800714720704925800858975855226030616351678564721552012363064;

    uint256 constant IC7x = 21784102768688778891821451264946272551842097046788051365310564686760563837510;
    uint256 constant IC7y = 17365570443265084854597591582878072860440276760269598725168180570902826577113;

    uint256 constant IC8x = 18221264558198107997105835626628430061327290067141190400458443931262552821985;
    uint256 constant IC8y = 17345001163978790340743964233094643606846020799439492652444314901587284810225;

    uint256 constant IC9x = 9495310020740656853808674579536908573756197511527748313571135388842418950888;
    uint256 constant IC9y = 4411998223256842354013596437423839004950375702080923698976594588228220970758;

    uint256 constant IC10x = 21038698570677595910379861775645342107192970285761859021919450992721210884595;
    uint256 constant IC10y = 10817037203865050564787578524888769857286771595614431402485188273904426508153;

    uint256 constant IC11x = 17268314915603775739929592434366811233499697054312080061858036583240608135450;
    uint256 constant IC11y = 3321894546146105571542541084450431102484242607238883563676192929656707122569;

    uint256 constant IC12x = 12732468672755497296643187651511865786996845667792406196833910067093417876729;
    uint256 constant IC12y = 20389309481085009521752121302256377276097628379504444921619596225003942981723;

    uint256 constant IC13x = 11520455324477320729860753746654122697108737896603457304678757178868133854776;
    uint256 constant IC13y = 9751852217689152529108772327714277624059857427321901153515938895829203785254;

    uint256 constant IC14x = 19691973802701651791340463578572412854813993779687373199148460763587059129742;
    uint256 constant IC14y = 9277172362926468554027124145705296089076035378489645565241394106899960739741;

    uint256 constant IC15x = 17707625805939961174259890284549096529187053876076072556429007520889245699625;
    uint256 constant IC15y = 5690877431691145689139820755785964035918053487705758917812474629149218843946;

    uint256 constant IC16x = 6240566927467589114561735129631057453439236335006559139315921616376168601997;
    uint256 constant IC16y = 16194643798174335892937838203427025235950600693987062738990209842249846413432;

    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[16] calldata _pubSignals
    ) public view returns (bool) {
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

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
            return(0, 0x20)
        }
    }
}
