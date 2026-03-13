
class ParameterParser {
    public static parse(url: URL) {

    }

    public static create(): string {
        
        return "";
    }
}

class App {
    private static instance: App;

    // private constructor to prevent direct instantiation
    private constructor() {
        // initialize any necessary properties or configurations here
    }

    // public method to access the singleton instance
    public static getInstance(): App {
        if (!App.instance) {
            App.instance = new App();
        }
        return App.instance;
    }
}