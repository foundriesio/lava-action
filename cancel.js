const core = require('@actions/core');
const undici = require('undici');

// LAVA cancels a job through a detail action on it, and django-rest-framework
// leaves such an action on GET unless it says otherwise - a POST here is
// answered with 405. Cancelling a job that has already finished, or that is
// already on its way to Canceled, is a no-op that still reports success, so
// there is nothing to check before asking.
async function cancelJob(host, jobId, lava_token) {
    const url = new URL("/api/v0.2/jobs/" + jobId + "/cancel/", host);
    const { statusCode, body } = await undici.request(url, {
        method: "GET",
        headers: {
            'Authorization': "Token " + lava_token,
        },
    });
    const detail = await body.text();
    if (statusCode !== 200) {
        throw new Error("HTTP " + statusCode + ": " + detail.slice(0, 200));
    }
}

async function main() {
    // submit.js clears this the moment the job reaches a conclusion, so
    // anything left here is a job LAVA is still running for a workflow that
    // has stopped reading it - a cancellation, a job timeout, or a failure
    // part way through the polling
    const jobId = core.getState("lava_job_id");
    if (!jobId) {
        return;
    }

    const host = "https://" + core.getInput("lava_url", {required: true});
    const lava_token = core.getInput("lava_token", {required: true});

    console.log("Cancelling LAVA job " + jobId + "...");
    try {
        await cancelJob(host, jobId, lava_token);
    } catch (ex) {
        // GitHub gives a cancelled job five minutes before it forcibly ends
        // everything, so this gets one attempt and no retries. The run is
        // over either way: a job left running in LAVA is worth an annotation,
        // not a second failure stacked on top of the first.
        core.warning("Could not cancel LAVA job " + jobId + ": " + ex.message);
        return;
    }
    // all LAVA promises is that the signal is on its way; the job sits in
    // Canceling until the dispatcher acts on it
    console.log("Cancel signal sent to LAVA job " + jobId);
}

main().catch((ex) => {
    core.warning("Error cancelling LAVA job: " + ex.message);
})
