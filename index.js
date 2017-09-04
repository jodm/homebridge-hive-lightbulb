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
	this.lightService = new Service.Lightbulb();
	this.informationService = new Service.AccessoryInformation();
	this.username = config.username;
	this.password = config.password;
	this.id = config.hasOwnProperty('id') ? config.id : null;
	this.mainDataCallbacks = [];
	this.login(function(key, error) {
		if(key) {
			this.findNode(function(node, error) {
				if(error) { this.log("HiveLightbulb: findNode Error: " + error) }
			}.bind(this))
		} else {
			this.log("HiveLightbulb: Unable to login. Error: " + error);
		}
	}.bind(this));
	this.cachedNode = null;
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

	login: function(callback) {	
		this.getAPIKey(function(key, error) {
			this.apiKey = key;
			if(callback) { callback(key, error); }
		}.bind(this));		
	},
	
	/**
	 * Get the main data from Hive's API using a queue to prevent multiple calls
	 *
	 * callback( error )
	 */

	findNode: function(callback) {
		
		/* If we don't have an API key, don't even bother */
		if (!this.apiKey ) { callback(null, "Error: findNode - Not logged in." ); }
		
		this.getNodes(function(error, response, body) {	

			if(!error) {
				jsonBody = JSON.parse(body);

				for(var i = 0; i < jsonBody.nodes.length; i++ ) {

					if(jsonBody.nodes[i].nodeType == "http:\/\/alertme.com\/schema\/json\/node.class.light.json#" || jsonBody.nodes[i].nodeType == "http:\/\/alertme.com\/schema\/json\/node.class.colour.tunable.light.json#") {
						
						// Check it's the bulb we are looking for. If not let's `continue`
						if (jsonBody.nodes[i].name !== this.name) { console.log(jsonBody.nodes[i].name + " = " + this.name); continue; }

						this.cachedNode = jsonBody.nodes[i];
						this.log("findNode: Light Found: with id: " + jsonBody.nodes[i].id + " name:" + jsonBody.nodes[i].name);
						if(callback) { callback(this.cachedNode, null); }
						break;
					}
				}
			}
		}.bind(this))
	},
	

	/* -------------------- */
	/* !Services */
	/* -------------------- */

	getServices: function() {

		this.lightService.getCharacteristic(Characteristic.On).on('get', this.getPowerState.bind(this))
		this.lightService.getCharacteristic(Characteristic.On).on('set', this.setPowerState.bind(this))
		this.lightService.getCharacteristic(Characteristic.On).updateValue(true);

		// Characteristic.Brightness

		this.lightService.getCharacteristic(Characteristic.Brightness).on('get', this.getBrightness.bind(this))
		this.lightService.getCharacteristic(Characteristic.Brightness).on('get', this.setBrightness.bind(this))

		if(this.cachedNode.nodeType == "http:\/\/alertme.com\/schema\/json\/node.class.colour.tunable.light.json#") {

			// Characteristic.Saturation

			this.lightService.getCharacteristic(Characteristic.Saturation).on('get', this.getSaturation.bind(this))
			this.lightService.getCharacteristic(Characteristic.Saturation).on('get', this.setSaturation.bind(this))

			// Characteristic.Hue

			this.lightService.getCharacteristic(Characteristic.Hue).on('get', this.getHue.bind(this))
			this.lightService.getCharacteristic(Characteristic.Hue).on('get', this.setHue.bind(this))
			
		}

		/* --------------------- */
		/* !AccessoryInformation */
		/* --------------------- */
		
		this.informationService
			.setCharacteristic(Characteristic.Manufacturer, "British Gas")
			.setCharacteristic(Characteristic.Model, "Hive Active Heating")
			.setCharacteristic(Characteristic.SerialNumber, " ");
		
		return [this.lightService,this.informationService];
	},

	/* -------------------- */
	/* !Get Methods */
	/* -------------------- */

	getPowerState: function(callback) {
		this.findNode(function(data) {
			var isOn = (data.attributes.state.reportedValue == "OFF") ? false : true
			callback(null, isOn);
		}.bind(this));
	},

	getBrightness: function(callback) {
		this.findNode(function(data) {
			callback(null, data.attributes.brightness.reportedValue);
		}.bind(this));
	},

	getSaturation: function(callback) {
		this.findNode(function(data) {
			callback(null, data.attributes.hsvSaturation.reportedValue);
		}.bind(this));
	},

	getHue: function(callback) {
		this.findNode(function(data) {
			callback(null, data.attributes.hsvHue.reportedValue);
		}.bind(this));
	},

	/* -------------------- */
	/* !Set Methods */
	/* -------------------- */

	setPowerState: function(powerOn, callback) {
		this.setNode({
				"nodes": [{
			        "attributes": {
			            "state": {
			                "targetValue": (powerOn) ? "ON" : "OFF"
			            }
			        }
			    }]
			}, function(error, data) {
			var isOn = (data.attributes.state.reportedValue == "OFF") ? false : true
			callback(error, isOn);
		});
	},

	setBrightness: function(brightness, callback) {

	},

	setSaturation: function(saturation, callback) {

	},

	setHue: function(hue, callback) {

	},

	/* -------------------- */
	/* !API Methods */
	/* -------------------- */

	getAPIKey: function(callback) {
		request.post({
			url: "https://api-prod.bgchprod.info:443/omnia/auth/sessions",
			headers: {
				'Content-Type': 'application/vnd.alertme.zoo-6.1+json',
				'Accept': 'application/vnd.alertme.zoo-6.1+json',
				'X-Omnia-Client': 'Hive Web Dashboard'
			},
			body: JSON.stringify({"sessions": [{"username": this.username, "password": this.password, "caller": "WEB"}]})
		} , function(error, response, body) {
			var json = JSON.parse(body);
			if (json.error) {
				callback(null, json.error.reason)
			} else {			
				callback(json.sessions[0].sessionId, null);	
			}

		})
	},

	// getNodes - Get array of Hive Objects

	getNodes: function(callback) {
		request({
			url: "https://api-prod.bgchprod.info:443/omnia/nodes",
			headers: {
				'Content-Type': 'application/vnd.alertme.zoo-6.1+json',
				'Accept': 'application/vnd.alertme.zoo-6.1+json',
				'X-Omnia-Client': 'Hive Web Dashboard',
				'X-Omnia-Access-Token': this.apiKey
			}
		}, callback);
	},

	// setNode

	setNode: function(object, id) {
		request.put({
			url: "https://api-prod.bgchprod.info:443/omnia/nodes/" + this.cachedNode.id,
			headers: {
				'Content-Type': 'application/vnd.alertme.zoo-6.1+json',
				'Accept': 'application/vnd.alertme.zoo-6.1+json',
				'X-Omnia-Client': 'Hive Web Dashboard',
				'X-Omnia-Access-Token': this.apiKey
			},
			body: JSON.stringify(object)}, callback);		
	}

};