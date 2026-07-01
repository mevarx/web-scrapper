FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy application files
COPY . .

# Switch to built-in non-root node user
USER node

EXPOSE 3000

CMD ["npm", "run", "dev"]
