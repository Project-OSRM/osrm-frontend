FROM mhart/alpine-node

# Enables customized options using environment variables
ENV BACKEND='http://localhost:5000'
ENV CENTER='38.8995,-77.0269'
ENV ZOOM='13'
ENV LANGUAGE='en'
ENV LABEL='Car (fastest)'

# Create app directory
RUN mkdir -p /src
WORKDIR /src

# Install app dependencies
COPY package.json /src
COPY yarn.lock /src
RUN yarn

# Bundle app source
COPY . /src

# Run App
EXPOSE 9966
CMD ["yarn", "start"]
