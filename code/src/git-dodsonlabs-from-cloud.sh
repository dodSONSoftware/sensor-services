# Copyright (c) 2025-2026 dodson Software ( dodson labs )
# Author: Randy Dodson <dodsonsoftware@gmail.com>
# Licensed under the MIT License with Patent Grant and NOTICE preservation.
# See the LICENSE file for the full terms.

#!/bin/bash

rm -rf ./dodsonlabs

git clone --branch main http://10.10.10.7:30008//sensor-services/dodson-labs-core.git

mv ./dodson-labs-core ./dodsonlabs
