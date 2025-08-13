# use the latest nodejs
FROM node:latest

# set the correct time and timezone
ENV TZ=America/Chicago

# install required apt packages
RUN apt update && apt install -y tzdata

# install typescript
RUN npm install -g typescript

# change working path
WORKDIR /app

# copy the packages
COPY package.json package-lock.json ./

# install npm packages
RUN npm install

# copy the rest of the code
COPY . ./

# build the typescript application
RUN tsc --build

# set the start file
CMD ["node", "./dist/index.js"]
