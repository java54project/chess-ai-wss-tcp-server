# Step 1: Use Node.js LTS version as the base image
FROM node:16

# Step 2: Set the working directory inside the container
WORKDIR /usr/src/app

# Step 3: Copy package.json and package-lock.json to the container
COPY package*.json ./

# Step 4: Install dependencies
RUN npm install

# Step 5: Copy the rest of the application files
COPY . .

# Step 6: Expose the WebSocket port (default from config.json)
EXPOSE 8080

# Step 7: Start the application
CMD ["node", "server.js"]