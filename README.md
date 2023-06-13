# GPIOoE to qLab

## Installation

```bash
brew install git node
curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash
nvm install 16
npm install -g yarn

git clone https://github.com/trippelm/gpio2qlab.git
cd gpio2qlab

yarn
```

## Usage

```bash
yarn start
```

After first button-click on the GPIOoE module after starting the script, it should show the hostname of the current GPIOoE board. If not, check the config.ini file, where you might need to set a static ip address for the GPIOoE board.

## Configuration

Open the config.ini file in your favorite text editor and change the values to your needs. It has comments to explain what each value does.
