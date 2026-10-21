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

contract Groth16VerifierV92CD3 {
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
    uint256 constant deltax1 = 3939131328140065896798195817183471999849201999597157631004309339202390826467;
    uint256 constant deltax2 = 3843675297237838499931165339606705949752783439238176759630130714231991153536;
    uint256 constant deltay1 = 7253641487989179845541175585407998703234768257982102078237546249918921101931;
    uint256 constant deltay2 = 3720009488823558970582747885002564799422703614402812590711806732051117205375;

    
    uint256 constant IC0x = 19848941337013009354827625693711026181193284136930027581458203351650531599672;
    uint256 constant IC0y = 13668614988447977458605562640411443801552805618472870232002423593303171966145;
    
    uint256 constant IC1x = 2314865503394253015500474138141593676777476788171633107928895447804422453097;
    uint256 constant IC1y = 2809025260285729935027562953781154501259556315914454404088921032752620877042;
    
    uint256 constant IC2x = 17138064554339456354676730375559647514778311726660566150920720933597259341017;
    uint256 constant IC2y = 6148925974928089390755331262591844633595583548779713833128963582689012651152;
    
    uint256 constant IC3x = 18843525875669935750288682297735976669001417849343159183730567371496830414106;
    uint256 constant IC3y = 13479114911232561111047827610064672403722187700160677258644846151618295807253;
    
    uint256 constant IC4x = 19830813257473305165843507579192023453160101445669020329551740789604208046042;
    uint256 constant IC4y = 19233839787787240214589505044948205503414437187447969664103487859712153010032;
    
    uint256 constant IC5x = 4077516085944943611545668962937338850221781731229932963267536168314497190211;
    uint256 constant IC5y = 9025435279553666351237461727280117502332602732082511229423838747027219101560;
    
    uint256 constant IC6x = 21150709016434266640287517961799890772416007631037970206824703457422970365404;
    uint256 constant IC6y = 18404808402633006747472119042637273912234913500364821948177753141332744894380;
    
    uint256 constant IC7x = 6844718163547974070786870178552043717909625495923821142637546603673071920376;
    uint256 constant IC7y = 18679056329996490763494955149183942137790639811833889780709770349837464256941;
    
    uint256 constant IC8x = 19074007263695057910208294857961693348300164676398537354062527744529333002809;
    uint256 constant IC8y = 4050785489722993406624141754914235209799735174110727776992039819286555418564;
    
    uint256 constant IC9x = 3570598449118696831928738385246867743552076584150489518426218890198042800366;
    uint256 constant IC9y = 8048145716514231280989050459283844020546225682522318729920851385784828545907;
    
    uint256 constant IC10x = 18920502116088997731193784207524351349297076646185354166558425772698657619408;
    uint256 constant IC10y = 15045506014481472090811205926661227581313526160742179407710608113569155740548;
    
    uint256 constant IC11x = 5959700991309457658002192729450429966720795193455946183433387355744156711478;
    uint256 constant IC11y = 20941737562806798724439604899956531443750678080003689427401920751962530732555;
    
    uint256 constant IC12x = 10424353190651424676951135949569591715466462332679489149826208297094022703136;
    uint256 constant IC12y = 21291055668601465380008219799810302703746473084661459184276021199688049077932;
    
    uint256 constant IC13x = 1379320363307262393178976605057325466581312036986986555530071402581563013947;
    uint256 constant IC13y = 13196525281449223250355050432097182386858016718701567715981025888713854476479;
    
    uint256 constant IC14x = 21119062272628363748210564704660098388239055697689132060404753085088422625284;
    uint256 constant IC14y = 12599076774280303492823921927224522543652592248851680338802596236006581096899;
    
    uint256 constant IC15x = 10307984631074865195413607350415928201329632998975955092779160618754992241985;
    uint256 constant IC15y = 8930534730961262804113752194546124185970566091502828308190599109992747519235;
    
    uint256 constant IC16x = 17916758399394524583088822936100434955784442572014999386148110631003649046937;
    uint256 constant IC16y = 14105447323675296071766262681156412694696740960776945739189776528846732084606;
    
    uint256 constant IC17x = 3866769517786351232491087277466552391607459712038765603004897144631924041202;
    uint256 constant IC17y = 8525881399213607782593335460018533867179349691364881215168147164970619848344;
    
    uint256 constant IC18x = 6355910721865342271751024459627318610661848307517679164471043623233659696757;
    uint256 constant IC18y = 6598727384625992312125205023966649485624007458602762093419244279412177730206;
    
    uint256 constant IC19x = 10049649885350925458865229111354746693084299714827401970062730679321453590697;
    uint256 constant IC19y = 9458556118413125346652031047013964540020264993678359161110950216074770926291;
    
 
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
