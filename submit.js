const fs = require("fs");

const core = require('@actions/core');
const github = require('@actions/github');
const {DefaultArtifactClient} = require('@actions/artifact')
const undici = require('undici');
const YAML = require('yaml')
const ColorReset = "\x1b[0m";

const BackgroundColor = {
    info: "\x1b[46m",
    debug: "\x1b[43m",
    results: "\x1b[44m",
    target: "\x1b[42m",
    error: "\x1b[41m",
    exception: "\x1b[45m",
    input: "\x1b[40m",
    feedback: "\x1b[102m",
    warning: "\x1b[103m",
}

const testResults = new Map();

async function printResults(fail_action) {
    console.log("Printing results")
    var hasFailures = false;
    var failedTest;
    for ( let [key, value] of testResults ) {
        console.log(key + ": " + value);
        if ( value == "fail" ) {
            hasFailures = true;
            failedTest = key;
        }
    }
    if ( hasFailures && fail_action ) {
        console.log("Action failed because of test failure");
        core.setFailed(failedTest);
    }
}

async function saveArtifacts(jobId, host, save_result_as_artifact) {
    console.log("Saving artifacts: " + save_result_as_artifact);
    if (save_result_as_artifact){
        const artifact = new DefaultArtifactClient()
        // Save results as artifact
        const jobResultsPath = "/api/v0.2/jobs/" + jobId + "/junit/";
        const [jobResults] = await Promise.all([
            undici.request(new URL(jobResultsPath, host)),
        ]);

        const { body: jobResultsBody, statusCode: jobResultsStatusCode } = jobResults;

        if (jobResultsStatusCode >= 400) {
            console.log("Error retrieving job results");
        }
        const fileName = "./test-results-" + jobId + ".xml"
        console.log("Writing to: " + fileName);
        const resultsBody = await jobResultsBody.text();
        await fs.writeFile(fileName, resultsBody, err => {
            if (err) {
                console.error(err);
            }});
        await fs.stat(fileName, (error, stats) => {
          if (error) {
            console.log(error);
          }
          else {
            console.log("Stats object for: " + fileName);
            console.log(stats);
          }
        });

        const {id, size} = await artifact.uploadArtifact(
            "test-results-" + jobId,
            [fileName],
            "./"
        )

        console.log(`Created artifact with id: ${id}, bytes: ${size}, name: ${fileName}`)
    }
}

async function fetchAndParse(jobId, logStart, host, fail_action_on_failure, save_result_as_artifact) {
    const jobStatusPath = "/api/v0.2/jobs/" + jobId + "/";
    const jobLogPath = "/api/v0.2/jobs/" + jobId + "/logs/?start=" + logStart;

    const [jobStatusResponse, jobLogResponse] = await Promise.all([
        undici.request(new URL(jobStatusPath, host)),
        undici.request(new URL(jobLogPath, host))
    ]);

    const { body: jobStatusBody, statusCode: jobStatusCode } = jobStatusResponse;
    const { body: jobLogBody, statusCode: jobLogStatusCode } = jobLogResponse;

    if (jobStatusCode >= 400) {
        console.log("Error retrieving job status");
        return setTimeout(() => fetchAndParse(jobId, logStart, host, fail_action_on_failure, save_result_as_artifact), 5000);
    }
    if (jobLogStatusCode >= 400) {
        console.log("Error retrieving job logs");
    }

    const jobStatus = await jobStatusBody.json();
    const jobLog = await jobLogBody.text();

    const { state } = jobStatus;
    const { health } = jobStatus;

    if (state === "Submitted" || state === "Scheduled") {
        console.log("Job state: %s", state);
    } else {
        if (jobLogStatusCode == 200) {
            try {
                yaml_log = YAML.parse(jobLog);

                for (const line of yaml_log) {
                    const { lvl, msg } = line;
                    const { case: msgCase, definition, result } = msg;

                    const textFormat = BackgroundColor[lvl];
                    if (lvl === "results") {
                        console.log(`${textFormat}case: %s | definition: %s | result: %s ${ColorReset}`, msgCase, definition, result );
                        const testFullName = definition + '/' + msgCase
                        testResults.set(testFullName, result);
                    } else {
                        console.log(`${textFormat}${msg}${ColorReset}`);
                    }
                    logStart += 1;
                }
            }
            catch (error) {
                console.log(error.message)
            }
        }
    }

    if (state === "Finished") {
        saveArtifacts(jobId, host, save_result_as_artifact);
        printResults(fail_action_on_failure);
        if (health === "Incomplete" || health === "Canceled") {
            console.log("Action failed because of job failure");
            core.setFailed(health);
        }
        return testResults;
    }

    return setTimeout(() => fetchAndParse(jobId, logStart, host, fail_action_on_failure, save_result_as_artifact), 5000);
}


async function main() {
    let file;
    let job_definition_path;
    let lava_token;
    let lava_url;
    let wait_for_job;
    let fail_action_on_failure;
    let save_result_as_artifact;

    try {
        job_definition_path = core.getInput("job_definition", {required: true});
        lava_token = core.getInput("lava_token", {required: true});
        lava_url = core.getInput("lava_url", {required: true});
        wait_for_job = core.getBooleanInput("wait_for_job", {required: true});
        fail_action_on_failure = core.getBooleanInput("fail_action_on_failure", {required: true});
        save_result_as_artifact  = core.getBooleanInput("save_result_as_artifact", {required: true});
        console.log("Wait for job: " + wait_for_job);
        console.log("Fail on failure: " + fail_action_on_failure);
        console.log("Save artifact: " + save_result_as_artifact);
    } catch (ex) {
        console.log("Error reading input variables");
        core.setFailed(ex.message);

        return;
    }

    const tokenString = "Token " + lava_token;
    const host = "https://" + lava_url;

    try {
        file = fs.readFileSync(job_definition_path, "utf-8");
    } catch (err) {
        console.log("Error reading job definition file");
        core.setFailed(err.message);

        return;
    }

    try {
        const url = new URL("/api/v0.2/jobs/", host);
        const options = {
          method: "POST",
          headers: {
            'Authorization': tokenString,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            definition: file,
          }),
        };

        const { statusCode, body } = await undici.request(
            url,
            options
        );

        if (statusCode === 201) {
            lavaJob = await body.json();
        } else {
            console.log("Error %s retrieving lava job", statusCode);
            core.setFailed(await body.json());

            return;
        }
    } catch (ex) {
        console.log("Error retrieving lava job");
        core.setFailed(ex.message);

        return;
    }

    const jobId = lavaJob.job_ids[0];

    console.log("Job ID: ", jobId);

    if ( wait_for_job ) {
        return await fetchAndParse(jobId, 0, host, fail_action_on_failure, save_result_as_artifact);
    }
    return true
}

main().then((data) => {
}).catch((ex) => {
    console.log('Error running action');
    core.setFailed(ex.message);
})
