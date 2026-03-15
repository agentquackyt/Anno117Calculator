Bun.file("./src/assets/productions/tunics.json").text().then((content) => {
    const node = JSON.parse(content);
    console.log(node);
});