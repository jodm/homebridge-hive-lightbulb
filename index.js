var Service, Characteristic;
var request = require("request");

module.exports = function(homebridge){
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-hive-lightbulb", "HiveLightbulb", HiveLightbulb);
};

function HiveLightbulb(log, config) {
	this.log = log;
	this.name = config.name;
	this.lightService = new Service.Light();
	this.informationService = new Service.AccessoryInformation();
	this.username = config.username;
	this.password = config.password;
	this.id = config.hasOwnProperty('id') ? config.id : null;
	this.mainDataCallbacks = [];
	this.getNewApiKey(function(error){
		if ( error ) {
			this.log("Could not log into Hive");
			this.log(error);
		} else {
			this.log( "Logged In" );
			this.getMainData(function(){},true);
		}
	}.bind(this));
	this.cachedDataTime = null;
	this.cachedMainData = null;
	this.debug = config.hasOwnProperty('debug') ? config.debug : false;
}

HiveLightbulb.prototype = {
	
	identify: function(callback) {
		callback(null);
	},
	
	/* -------------------- */
	/* !Utility Methods		*/
	/* -------------------- */

	/**
	 * Get a new API key
	 */

	getNewApiKey: function(callback) {	
		this.log("Logging into Hive...");	
		request.post({
			url: "https://api-prod.bgchprod.info:443/omnia/auth/sessions",
			headers: {
				'Content-Type': 'application/vnd.alertme.zoo-6.1+json',
				'Accept': 'application/vnd.alertme.zoo-6.1+json',
				'X-Omnia-Client': 'Hive Web Dashboard'
			},
			body: JSON.stringify({
				"sessions": [{
					"username": this.username,
					"password": this.password,
					"caller": "WEB"
				}]
			})
		},
		function(error, response, body) {
			try {
				var json = JSON.parse(body);
				if ( json.error ) {
					callback( json.error.reason )
				} else {
					this.apiKey = json.sessions[0].sessionId;
					callback( null );
				}
			} catch (e) {
				callback( "JSON Parse Error\n" + body );
			}
		}.bind(this));		
	},
	
	/**
	 * Get the main data from Hive's API using a queue to prevent multiple calls
	 *
	 * callback( error )
	 */
	getMainData: function(callback,showIds) {
		
		/* If we don't have an API key, don't even bother */
		if ( !this.apiKey ) {
			callback( "No API key" );
		}
		
		/* If we have a cache from within 2 seconds, use that */
		if ( this.cachedDataTime && this.cachedDataTime > Date.now() - 1000 ) {
			callback( null, this.cachedMainData );
			return;
		}
		
		/* If we have already started doing this, just add our callback to the queue to run when we're done */
		if ( this.mainDataCallbacks.length ) {
			this.mainDataCallbacks.push( callback );
			return;
		}
		this.mainDataCallbacks.push( callback );
		
		/* Still here? Define the sucess handler... */
		var successHandler = function(body){
			/* Parse the response */
			for ( var i = 0; i < body.nodes.length; i++ ) {

				if(body.nodes[i].nodeType == "http:\/\/alertme.com\/schema\/json\/node.class.light.json#" || body.nodes[i].nodeType == "http:\/\/alertme.com\/schema\/json\/node.class.colour.tunable.light.json##") {
					var sensorName = body.nodes[i].name;
					if (sensorName !== this.name ) {
						this.log("Ignoring " + sensorName);
					}

					this.cachedMainData = body.nodes[i];
					this.log("Found motion sensor " + body.nodes[i].id + ", name:" + sensorName + ", motion=" + sensorInMotion + ", from=" + sensorMotionStarted + ", to=" + sensorMotionEnded);
				}
			}

			this.cachedDataTime = Date.now()
			
			/* Run our callbacks */
			for ( var i = 0; i < this.mainDataCallbacks.length; i++ ) {
				this.mainDataCallbacks[i]( null, this.cachedMainData );
			}
			this.mainDataCallbacks = [];
		}.bind(this);

		/* ...and make the call */
		this._getMainData(function(error, response, body) {	
			if ( this.debug ) {
				this.log( response );
			}
			body = JSON.parse(body);
			if ( body.errors ) {
				this.getNewApiKey(function(error){
					this._getMainData(function(error, response, body) {
						body = JSON.parse(body);
						if ( body.errors ) {
							this.log( body.errors );
						} else {
							successHandler(body);
						}
					}.bind(this));
				}.bind(this));
				return;
			}
			successHandler(body);
			
		}.bind(this));		
	},
	
	/**
	 * Get the main data from Hive's API
	 *
	 * callback( error )
	 */
	_getMainData: function(callback) {
		this.log( "Fetching data from Hive API" );		
		request({
			url: "https://api-prod.bgchprod.info:443/omnia/nodes",
			headers: {
				'Content-Type': 'application/vnd.alertme.zoo-6.1+json',
				'Accept': 'application/vnd.alertme.zoo-6.1+json',
				'X-Omnia-Client': 'Hive Web Dashboard',
				'X-Omnia-Access-Token': this.apiKey
			}
		}, callback );
	},
	
	/* -------------------- */
	/* !Services */
	/* -------------------- */

	getServices: function() {

		/**
		 * Sensor status
		 */
		this.lightService.getCharacteristic(Characteristic.On)
			.on('get', function(callback) {
				this.getMainData(function(error,data){
					var isOn = (data.attributes.state.reportedValue == "OFF") ? false : true
					this.log( "On: " + isOn );
					callback( error, isOn );
				}.bind(this));
			}.bind(this));

		
		/* --------------------- */
		/* !AccessoryInformation */
		/* --------------------- */
		
		this.informationService
			.setCharacteristic(Characteristic.Manufacturer, "British Gas")
			.setCharacteristic(Characteristic.Model, "Hive Active Heating")
			.setCharacteristic(Characteristic.SerialNumber, " ");
		
		return [this.lightService,this.informationService];
	}
};