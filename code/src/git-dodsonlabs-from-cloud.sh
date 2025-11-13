# Author: Randy Dodson ( dodson labs )
# License: 2025, MIT License (see LICENSE file for details)

#!/bin/bash

rm -rf ./dodsonlabs

git clone --branch main http://nas-server.local:30008//sensor-services/dodson-labs-core.git

mv ./dodson-labs-core ./dodsonlabs
