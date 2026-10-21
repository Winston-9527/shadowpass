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

contract Groth16VerifierV92CD4 {
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
    uint256 constant deltax1 = 577899931775174147052770342267300340798128566452716395232504148518110408052;
    uint256 constant deltax2 = 12321785381134918313500300072292529918922719384000261852810926679042382318434;
    uint256 constant deltay1 = 13907238759496631350182133645893076596477255734200550317807625298645024948323;
    uint256 constant deltay2 = 1639372489788328550768188064004369666805593095182196165787218837498661393588;

    
    uint256 constant IC0x = 5521065433868231338285623756105322036924691499706390901179642336610540155067;
    uint256 constant IC0y = 10624225223529289607051321757411055951497793676206444480418786493792993227385;
    
    uint256 constant IC1x = 6946057527820339895762713861359826278575065847131244975747779770249292667637;
    uint256 constant IC1y = 2034323559833105766052156604063286044928611736304149918445364077505848898201;
    
    uint256 constant IC2x = 20351361902901757455204300947080878734105531003034988686601522345018796698454;
    uint256 constant IC2y = 7054916670113770482336785901976250473965404522177323310454563651722438992428;
    
    uint256 constant IC3x = 12253719525746280577785653636054897393580047768407837801268217981735754474754;
    uint256 constant IC3y = 15466647367625078070600966675824084717488689636173634912828452027151590896551;
    
    uint256 constant IC4x = 19029580913555363513856063510015831787162704130508202430499965038026147340322;
    uint256 constant IC4y = 6171716837331821290943230848175200748369964806630296372907803036566109559022;
    
    uint256 constant IC5x = 6030109481639663758093033556715734272954576292621363341214975659901788424649;
    uint256 constant IC5y = 7494396184194017302535724690351283492007283167009730024576022479898876406480;
    
    uint256 constant IC6x = 1340007864808127712626277432690336244327958214162000888878562087920051191999;
    uint256 constant IC6y = 14271694806721632271788264071107824336192741547930977012283361846947712439298;
    
    uint256 constant IC7x = 19268063138824785743977140212150430293441630560565136407897076365073462432149;
    uint256 constant IC7y = 4868816489498879502995147083770793456620762882783166614517019035604122889838;
    
    uint256 constant IC8x = 469825246280753115767313210927275027914157681266708866129327568938480258147;
    uint256 constant IC8y = 17238171549238279613857823577974815354183882589172418465261313310867504915743;
    
    uint256 constant IC9x = 12834285440248706573311181449319129553365201930374028980901717128876107459914;
    uint256 constant IC9y = 17244390337798586264897171888152500246862548194658174118198528572608859679088;
    
    uint256 constant IC10x = 18943956005929006362055546874149643757069862215115065083659071380959928946115;
    uint256 constant IC10y = 12333455373516497782679947461868521533234925874201927184373264246097763833764;
    
    uint256 constant IC11x = 16792003345563995822367456829025683867691230542783812542394313259025828174149;
    uint256 constant IC11y = 6859209280589895974869933401741053694941062254837923805466655509402777709109;
    
    uint256 constant IC12x = 724747650132852526122085514663192409269391596739247399090556286929922770189;
    uint256 constant IC12y = 879211672234636588141009530038662733126475166102692223577018154754395486168;
    
    uint256 constant IC13x = 6518957955840333471199284138201709630080067136698927361216967652156082166772;
    uint256 constant IC13y = 2402635243468192056199837135472703835637028222524315938886516285716452834316;
    
    uint256 constant IC14x = 88949609868350829416311903686737915814165397316715876609160266244266067507;
    uint256 constant IC14y = 8125898958882105104069142358589969238923860515278274957220093205144337428864;
    
    uint256 constant IC15x = 875022103697564488854715447090151246448438223434426266860745817251560036966;
    uint256 constant IC15y = 3193850003518697578844900588517670582216487650317837000538838827225184279925;
    
    uint256 constant IC16x = 14413020118095008043600871968561542065042176020365722004707049255966085188785;
    uint256 constant IC16y = 13322337641051605528324493763075093814903127900302049809946690867158633676546;
    
    uint256 constant IC17x = 556097622645909763376400564243375262601653609659253073660093288679980924224;
    uint256 constant IC17y = 13121453016431517079942213570274496734695946600881564941477161399991644006329;
    
    uint256 constant IC18x = 136447809848413000200036900814073430434915969543824526550421505960419093298;
    uint256 constant IC18y = 10569408607964945151150015793615450852080149593050112818649601278410553260659;
    
    uint256 constant IC19x = 10370402147299998391415995885223307829177101551774918330742743559139756337000;
    uint256 constant IC19y = 1026331507833422167510118492368792247312472675936535573326691416916559064925;
    
    uint256 constant IC20x = 21094824325621887381943899788975798186405109379554628915122650190530583622013;
    uint256 constant IC20y = 12667880477715791564135568868670084466329582641220029494035120810781869558569;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[20] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
