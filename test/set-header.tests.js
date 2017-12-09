// Copyright (c) 2017 The Authors of 'JWTS for NODE'
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of
// this software and associated documentation files (the "Software"), to deal in
// the Software without restriction, including without limitation the rights to
// use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
// the Software, and to permit persons to whom the Software is furnished to do so,
// subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
// FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
// IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

var jwt = require('../index');
var expect = require('chai').expect;
var BasicIdToken = require('../node_modules/src/models/tokenProfiles/basicIdToken');


describe('set header', function() {

  it('should add the header', function () {

    var clockTimestamp = 1000000000;
    
    var basicIdToken = new BasicIdToken('issuer','subject', clockTimestamp, "jti");
    basicIdToken.addNonStandardClaims({"aud" : "audience", "nbf" : clockTimestamp + 2, "exp" : clockTimestamp + 3});
    basicIdToken.setNoneAlgorithm(true);
    var signedJWT = basicIdToken.toJWT("123", {header: { foo: 'bar' }});    

    var decoded = basicIdToken.fromJWT(signedJWT, "123", {"iss" : "issuer", "sub": "subject", "aud" : "audience", 'maxAge': '1d', 'clockTolerance' : 10, "jti": "jti"},{'clockTimestamp' : clockTimestamp, complete: true});        
  
    expect(decoded.header.foo).to.equal('bar');
    
});

  it('should allow overriding header', function () {
  
    var clockTimestamp = 1000000000;
    
    var basicIdToken = new BasicIdToken('issuer','subject', clockTimestamp, "jti");
    basicIdToken.addNonStandardClaims({"aud" : "audience", "nbf" : clockTimestamp + 2, "exp" : clockTimestamp + 3});
    basicIdToken.setNoneAlgorithm(true);
    var signedJWT = basicIdToken.toJWT("123", {header: { alg: 'HS512' }});    

    var decoded = basicIdToken.fromJWT(signedJWT, "123", {"iss" : "issuer", "sub": "subject", "aud" : "audience", 'maxAge': '1d', 'clockTolerance' : 10, "jti": "jti"},{'clockTimestamp' : clockTimestamp, complete: true});        
    expect(decoded.header.alg).to.equal('HS512');
});

});