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

contract Groth16VerifierV7CD1 {
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
    uint256 constant deltax1 = 10939560302876285886297303248869420446024551111958602309036123737787177126057;
    uint256 constant deltax2 = 5805965246343569422639482842524194205021140505990288469796963385195832904650;
    uint256 constant deltay1 = 5656727188677119830236694528986571531012234656782735821667003956803011104932;
    uint256 constant deltay2 = 8289213678895572062507332592729916384627633294818122058736591842624271704384;

    
    uint256 constant IC0x = 13209185241675432823482599037606252992330995031532250558403622031282288896353;
    uint256 constant IC0y = 11115069121968593189754109588381825176180306080296875535033348938595463683599;
    
    uint256 constant IC1x = 5868379022925518306798628324153148284505464164876931209197054459946833803561;
    uint256 constant IC1y = 11986507777961590472477376624183267956634236107565641013734646361900506870440;
    
    uint256 constant IC2x = 10593465600899797284376500952281056346469299444024221211395547771859034234534;
    uint256 constant IC2y = 1627936465892405900580714914464702512910862121980649920825579882930838605484;
    
    uint256 constant IC3x = 21563825995513679231135474684655700069953971386635220117782435998453587369389;
    uint256 constant IC3y = 12563599706240736633550935303405499938364376675914739447840130984301193006385;
    
    uint256 constant IC4x = 7500553292770013877469366710414144053102174890108934964479870247843462006917;
    uint256 constant IC4y = 18339469809443405456244982842590833135144138306015119616969970833207541350185;
    
    uint256 constant IC5x = 6584794481277166480195531666936320543626633846082242614131230573291233474805;
    uint256 constant IC5y = 13331915201286662161065360738855912595505291247283907670691859784401304964830;
    
    uint256 constant IC6x = 16553892647327384061983391224758139344256412323433605697838756792538266725041;
    uint256 constant IC6y = 7541753370680754225829404802377622217036715775545591847807387977315434577548;
    
    uint256 constant IC7x = 21279835606309406682508794650187546764507278875431097842271802656058857523738;
    uint256 constant IC7y = 4358493970652975379061059995809026258060510083431887013063229938384783384925;
    
    uint256 constant IC8x = 14828207954299348838770639959478067629680882532081277983135745640282771568081;
    uint256 constant IC8y = 7856378281876610088980699027083868191852921601327183983416912948317128684898;
    
    uint256 constant IC9x = 7757930563185842863338715951622924773389954568497148792420703564143219726472;
    uint256 constant IC9y = 18573822468067363639267817932067188113250467128837412507153626271142821845049;
    
    uint256 constant IC10x = 7737551102742476194527497945998453640030912243846163560142971300200379976258;
    uint256 constant IC10y = 1556871037580877194680700016664061316528889336442029797156500830887144222851;
    
    uint256 constant IC11x = 5860746363028642106910389772898553411462339666414883575952780282926335448703;
    uint256 constant IC11y = 12273333289095981273599896557964982775288972252040827950617301195861558970406;
    
    uint256 constant IC12x = 10567041424248317403816523706502910094662659780835151885939930957342088149012;
    uint256 constant IC12y = 8530475006579895986415557030174092352836728882788830741039139473062751330084;
    
    uint256 constant IC13x = 21047063820840905228551423155916023132125564733613373491487804007985163572170;
    uint256 constant IC13y = 2761422930166608930480965749945100807383011224777497408822148390403107177315;
    
    uint256 constant IC14x = 5707420307020094963879188223870676625135821610664169795556224113005378095249;
    uint256 constant IC14y = 14028032598270945571232305366683412202025533299295508014245559133269914265127;
    
    uint256 constant IC15x = 3581279527522589793645022267213062326516074566273938579970234762520748865742;
    uint256 constant IC15y = 9614618437623322032761820020568324263078530597298995267779432927695232414558;
    
    uint256 constant IC16x = 2533480644885774226418855056084735155463524694496044278215265259003110716336;
    uint256 constant IC16y = 18174895108569633102978243686418469871904686575017335154869532400008082140688;
    
    uint256 constant IC17x = 6827676602672765541287223814374630172791806167070658825241408128095683413165;
    uint256 constant IC17y = 15176273030519494394046201269034449705189102833284236515683660207421659148801;
    
 
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
