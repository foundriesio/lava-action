# LAVA job submit action

This action submits LAVA job to a LAVA instance

## Inputs

## `job_definition`

**Required** File path to fully rendered job definition

## `lava_token`

**Required** Authorization token from user able to submit test jobs.

## `lava_url`

**Required** URL of LAVA instance.

## `wait_for_job`

Wait for job completion and stream logs'

## `fail_action_on_failure`

Marks action failed in any test result is `fail`. Requires `wait_for_job` set to `true`

## `save_result_as_artifact`

Saves JUNIT file with test results. The file name is `test-resutls-<lava job ID>.xml`.
The file is saved to the top directory of the workflow artifacts.

## `save_job_details`

Saves LAVA job details retrieved from API as JSON file. Note that the file contains
full rendered job definition. It may contain sensitive data (like passwords).
Defaults to `false`

## `result_file_name`

The file name of the results pulled from LAVA API after the job is completed.
It can be used to overwrite the results when re-running the action in github workflow.
Defaults to `test-results-<jobID>`

## Example usage

    uses: foundries/lava-action@v3
    timeout-minutes: 10
    with:
      lava_token: '<auth token>'
      lava_url: 'example.lava.instance'
      job_definition: 'lavajob.yaml'
      wait_for_job: 'true'
      fail_action_on_failure: 'true'

Note! It is advised to set `timeout-minutes` to avoid the job runninng indefinitely.
