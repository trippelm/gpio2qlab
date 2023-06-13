const dgram = require("dgram");
const OSC = require('osc');
const udp = dgram.createSocket("udp4");
const os = require("os");
const fs = require("fs/promises");
const fssync = require("fs");
const ini = require("ini");

// Load config
let config = ini.parse(fssync.readFileSync("./config.ini", "utf-8"));

if (!config || !config.main) {
	console.log("No main section found in config.ini");
	process.exit();
}

if (config.main.pin < 1 || config.main.pin > 8) {
	process.stderr.write(`Invalid GPI pin ${config.main.pin}\n`);
	process.exit();
}

// Clear screen
process.stdout.write("\x1B[2J\x1B[H");

const osc = new OSC.UDPPort({
    localAddress: "0.0.0.0",
    localPort: 53005,
    metadata: true
});
osc.open();
osc.on("ready", function () {
	console.log("🔸 OSC ready");
});
osc.on('error', function (err) {
	console.log("❌ OSC error", err);
});

let packet_counter = {};

let lastGpi = [false, false, false, false, false, false, false, false];

let lastPress = 0;
let lastParsed = {};

const getMessage = Buffer.from('{"status":"get"}');

function updateInfo(parsed, dryRun = false) {
	if (parsed.gpi) {
		const b = "\x1B[33m";
		const ub = "\x1B[m";
		let print = "🕹️  " + parsed.host;
		const PORT = parseInt(config.main.pin, 10) - 1;
		const gpi = [];
		let message = '';

		if ((Date.now() - lastPress) < (config.main.cue_retrigger_delay*1000)) {
			let time = config.main.cue_retrigger_delay - Math.round((Date.now() - lastPress) / 1000);
			message = `Must wait ${b + time + ub} seconds before triggering again.`;
		}

		Object.keys(parsed.gpi).forEach((key) => {
			gpi.push(parsed.gpi[key] == 1);
		});

		if (lastGpi[PORT] != gpi[PORT] && gpi[PORT]) {
			if (Date.now() - lastPress >= (config.main.cue_retrigger_delay*1000)) {
				if (!dryRun) {
					message = "Sending OSC"
					osc.send({
						address: `/cue/${config.main.cue}/start`,
						args: []
					}, config.main.qlab_ip || '127.0.0.1', config.main.qlab_port ? parseInt(config.main.qlab_port, 10) : 53000);
					lastPress = Date.now();
				}
			}
		}

		Object.keys(parsed.gpi).forEach((key) => {
			print += " " + (parsed.gpi[key] ? "🟩" : "⬛️" );
			gpi.push(parsed.gpi[key] == 1);
		});

		// Clear line and print
		process.stdout.write("\r\x1B[2K" + print + ' ' + message);

		lastGpi = gpi;
	}
	lastParsed = parsed;
}

setInterval(async () => {
	if (Date.now() - lastPress <= ((config.main.cue_retrigger_delay + 1)*1000)) {
		updateInfo(lastParsed, true);
	}

	// Reload config every second, so we can change it on the fly
	try {
		const data = await fs.readFile("./config.ini", "utf-8");
		let newConfig = ini.parse(data);
		if (newConfig && newConfig?.main?.cue !== undefined) {
			config = newConfig;
		}
	} catch (e) {
		// Ignore
	}
}, 1000);

udp.on("message", (msg, rinfo) => {
	try {
		const parsed = JSON.parse(msg.toString());
		if (parsed) {
			// Handle packet counter and ask for status if something is lost
			if (parsed.host && parsed.pno > -1) {
				if (
					packet_counter[parsed.host] !== undefined &&
					packet_counter[parsed.host] + 1 !== parsed.pno
				) {
					/*console.log(
						packet_counter[parsed.host] < parsed.pno
							? "Missed packet?"
							: "Rebooted device?",
						parsed.host,
						packet_counter[parsed.host],
						parsed.pno
					);*/
					// udp send to rinfo.address to get latest status
					udp.send(getMessage, 1337, rinfo.address);
				}
				packet_counter[parsed.host] = parsed.pno;
			}

			if (config.main.board) {
				if (parsed.host !== config.main.board) {
					return;
				}
			}

			updateInfo(parsed);
		}
	} catch (e) {
/*		console.log("Got message: " + msg.toString());
		console.log("Error parsing message", e);*/
		fs.writeFile("./error.log", Date.now() + ' Packet parsing error: ' + e.toString() + "\n").catch(() => {});
	}
});

// send udp packet
udp.on('error', async (err) => {
	console.log("❌ UDP binding error");
	await fs.writeFile("./error.log", Date.now() + ' ' + err.toString() + "\n")
});

udp.bind(31337,() => {

	// add membership to multicast group for each interface on the device
	const ifaces = os.networkInterfaces();
	Object.keys(ifaces).forEach((ifname) => {
		ifaces[ifname].forEach((iface) => {
			if (iface.family !== "IPv4" || iface.internal !== false) {
				return;
			}
			try {
				udp.addMembership("239.0.13.37", iface.address);
				console.log(" 🔹 Added mcast membership to %o", iface.address)
			} catch (e) {
				console.log(" ❌ Error adding membership to " + iface.address, e);
			}
		});
	});

	udp.setTTL(10);

	console.log("🔸 GPIO UDP socket ready");
	console.log("🔸 Reading config every second");

	setTimeout(() => {
		console.log("");
		lastParsed = {
			host: 'GPIOoE-??????',
			pno: 0,
			gpi: {
				gpi0: 0,
				gpi1: 0,
				gpi2: 0,
				gpi3: 0,
				gpi4: 0,
				gpi5: 0,
				gpi6: 0,
				gpi7: 0
			}
		}
		updateInfo(lastParsed);
	
		setInterval(() => {
			if (config.main.unicast_ip !== undefined) {
				udp.send(getMessage, 1337, config.main.unicast_ip)
			}
		}, 100);
	}, 1000);
});