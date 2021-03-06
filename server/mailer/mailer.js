/* eslint-disable no-inner-declarations */
const fs = require("fs");
const path = require("path");
const get_admission_status = require("./jamb_scraper.js");
const update_stats = require("../update_stats.js");
const log_func = require("../logger.js");
const mail = require("./mail_sender.js");

let session_count = 0;

let error_count = 0;
async function log_error(msg, err){
	await log_func(msg, err);
	error_count++;
}

async function send_mail(email, status){
	let d = (new Date()).toString();
	let result = status;
	let receipt = await mail({
		to: email,
		subject: "Admission status update from AutoCaps",
		html: `
<h1><p><img src="https://www.jamb.org.ng/images/banner.png" width="400px" height="42px" /></p> </h1> 
<small><p>Here are your <b>JAMB CAPS updates </b> for today<br></small>
${d}
<hr> 
<p></p>  
<b>&gt;&gt;</b> <i>${result}</i></p>
<hr>
<footer>
<p>Generated by: <b>AutoCAPS</b></p>
<p>Contact information: <a href="autocaps.herokuapp.com">AutoCAPS.herokuapp.com</a>.</p>
</footer>

<p><strong>Note:</strong> <kbd>Copyright 2019 by AutoCAPS. All Rights Reserved..</kbd></p>
`
	}).catch((e) => {
		throw e;
	});
	console.log(receipt);
	return true;
}

async function handle_user({jamb: jamb, email: personal, password: pwd}){	
	console.log(session_count+" scraping...");
	// status variable returns boolean, showing is admission status
	let status = await get_admission_status(jamb, pwd).catch((e) => {
		log_error(`Error getting admission status for user where mail: ${jamb}`, e);
		throw e;
	});// get admission status
	console.log(`Admission status : ${status}`);
	await send_mail(personal, status).catch((e) => {
		log_error(`Error on ${jamb}. Unable to send email to ${personal}`, e);
		throw e;
	});// send mail to user
	console.log(`Sent mail`);
	return;
}


let user_count = 0;
async function do_session(){
	return new Promise((resolve, reject) => {
		fs.readFile(path.resolve(__dirname, "../db.json"), "utf8", async (err, data) => {
			if (err) {
				log_error(`Error reading database. Unable to execute session : ${err}`);
				return;
			}
			let db = JSON.parse(data.toString());
			let users = db.users;
			for(let u of users){
				user_count++;
				if(session_count % u.frequency == 0 && u.count > 0){
					continue;
				}
				let err_on_user = false;
				await handle_user(u).catch(() => {
					err_on_user = true;
				});
				if(!err_on_user){ u.count++; }
				//if(user_count > 5 ){ break; }
			}
			resolve(true);
		})
	});
}



// 3,600,000 = milli secs in an hour
function loop_sessions(){
	return new Promise((resolve, reject) => {
		try{
			let one_hour = 3600000;
			let min_interval = one_hour * 12;// <- every 12 hours 
			//let interval = one_hour * 0.002778;// <- every 10 secs for development;
			let avg_time =[0,0];
			async function run_sessions(){
				console.log("Running session");
				let s_start = (new Date()).getTime();
				let session_error = false;
				await do_session().catch(() => {
					session_error = true;
				});
				if(!session_error){ session_count++; }
				let s_end = (new Date()).getTime();
				let time_passed = s_end - s_start;
				avg_time[0] += time_passed;
				avg_time[1] ++; 
				update_stats({
					avg_time_per_session: (avg_time[0]/avg_time[1])/1000,
					last_session_time: ((new Date).toString()),
					sessions_run: 1,
					user_count,
					error_count
				}).catch((e) => {
					log_error(e);
				});
				if(time_passed > min_interval){
					run_sessions();
				}else{
					let waiting_period = min_interval - (time_passed);
					setTimeout(run_sessions, waiting_period);
				}
			}
			run_sessions();
		}catch(e){
			reject(e);
		}
	})
}
module.exports = loop_sessions; /* <- Starts the loop. 
	Cannot be stopped except by closing the current node process.
	If this script is run more than once, multiple loop sessions will run simultaneously.
*/
