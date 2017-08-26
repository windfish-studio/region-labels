//Finds an unknown point distance L along a quadratic curve from a known point.
//Alex Pilafian 2017 - sikanrong@gmail.com - github.com/sikanrong
//If you reuse this code please give me attribution, my dude! I worked hard on this.

//parabola defined by ax^2 + bx + c, a and b are passed in to constructor while c is omitted because it isn't relevant to our calculations.
//u is known point x-value
//L is known length to travel down the curve for our unknown point.
//v is the unknown point x-value, once we have v we can calculate the correspondiing unknown y just by pluging it
//back into our parabola function

var sigFigs = 100000; //round to 5 significant figures
function ParabolicArcSolver(a, b, u, L){
    var du = (b + 2*a*u);
    var lu = Math.sqrt(1 + Math.pow(du, 2));

    var taylor = function(){
        return u + (L / lu)
    }

    var newton = function(v){
        var dv = (b + 2*a*v);
        var lv = Math.sqrt(1 + Math.pow(dv, 2));
        return v + ((lv*(4*a*L + du*lu - dv*lv + Math.asinh(du) - Math.asinh(dv)))/(2*a*(2 + 2 * Math.pow(dv, 2))))
    }

    //get a good first guess for newton from taylor
    var firstGuess = taylor();

    //Recursively run newton until it converges on an answer
    var doApproximation = function(v){
        if(a == 0){ //handle the case that we want to do the same operation on a line and not a parabola
            return ( u + (L / Math.sqrt(1 + Math.pow(b, 2))) );
        }else{
            var lastNewton = newton(v)
            if((v - lastNewton) <= 1/sigFigs){
                return (Math.floor(Math.round(v*sigFigs)) / sigFigs);
            }else{
                return doApproximation(lastNewton);
            }
        }
    }

    return doApproximation(firstGuess);
}

module.exports = ParabolicArcSolver;