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
